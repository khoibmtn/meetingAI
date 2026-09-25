#!/usr/bin/env python3
"""Sinh src/lib/database.types.ts (định dạng tương thích `supabase gen types`) từ một
PostgreSQL đã chạy migration. Dùng khi không có Supabase CLI:

    python3 scripts/gen-db-types.py "postgresql://postgres@localhost:54329/mtest" > src/lib/database.types.ts
"""
import json
import subprocess
import sys

DSN = sys.argv[1]

PG_TO_TS = {
    "uuid": "string", "text": "string", "character varying": "string", "varchar": "string",
    "timestamp with time zone": "string", "timestamp without time zone": "string", "date": "string",
    "boolean": "boolean", "integer": "number", "bigint": "number", "smallint": "number",
    "numeric": "number", "real": "number", "double precision": "number",
    "jsonb": "Json", "json": "Json", "bytea": "string", "regdictionary": "string",
}


def q(sql):
    out = subprocess.check_output(["psql", DSN, "-At", "-c", f"select coalesce(json_agg(t), '[]') from ({sql}) t"])
    return json.loads(out)


def ts_type(data_type, udt_name):
    if data_type == "ARRAY":
        base = udt_name.lstrip("_")
        m = {"text": "string", "uuid": "string", "int4": "number", "int8": "number", "bool": "boolean"}
        return f"{m.get(base, 'string')}[]"
    if data_type == "USER-DEFINED":
        return "string"
    return PG_TO_TS.get(data_type, "unknown")


cols = q("""
  select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default,
         c.is_identity, c.is_generated, c.ordinal_position
    from information_schema.columns c
    join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
   where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
   order by c.table_name, c.ordinal_position
""")
fks = q("""
  select con.conname as name, rel.relname as table_name, frel.relname as ref_table,
         (select array_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols,
         (select array_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as ref_cols
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fn on fn.oid = frel.relnamespace
   where con.contype = 'f' and n.nspname = 'public' and fn.nspname = 'public'
   order by con.conname
""")
uniques = q("""
  select rel.relname as table_name,
         (select array_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where con.contype in ('u', 'p') and n.nspname = 'public'
""")
funcs = q("""
  select p.proname as name,
         pg_get_function_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as result,
         p.proretset as returns_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname in ('get_group_invite','join_group_by_code','regenerate_invite_code','get_or_create_dm',
                       'mark_channel_read','my_channels','search_recordings','claim_transcription_chunk',
                       'claim_job','is_admin','can_view_recording','can_edit_recording')
   order by p.proname
""")

tables = {}
for c in cols:
    tables.setdefault(c["table_name"], []).append(c)

unique_sets = {}
for u in uniques:
    unique_sets.setdefault(u["table_name"], []).append(tuple(u["cols"]))


def arg_ts(pgtype):
    pgtype = pgtype.strip()
    if pgtype.endswith("[]"):
        return arg_ts(pgtype[:-2]) + "[]"
    return {
        "uuid": "string", "text": "string", "integer": "number", "bigint": "number", "boolean": "boolean",
        "timestamp with time zone": "string", "numeric": "number", "jsonb": "Json", "void": "undefined",
    }.get(pgtype, "unknown")


def parse_args(argstr):
    out = []
    if not argstr:
        return out
    for part in argstr.split(","):
        part = part.strip()
        has_default = " DEFAULT " in part
        part = part.split(" DEFAULT ")[0]
        name, _, typ = part.partition(" ")
        out.append((name, arg_ts(typ), has_default))
    return out


def parse_table_result(res):
    inner = res[res.index("(") + 1: res.rindex(")")]
    fields = []
    depth = 0
    cur = ""
    for ch in inner:
        if ch == "," and depth == 0:
            fields.append(cur)
            cur = ""
            continue
        depth += ch == "("
        depth -= ch == ")"
        cur += ch
    fields.append(cur)
    out = []
    for f in fields:
        f = f.strip()
        name, _, typ = f.partition(" ")
        out.append((name, arg_ts(typ)))
    return out


lines = []
w = lines.append
w("// ĐƯỢC SINH TỰ ĐỘNG bởi scripts/gen-db-types.py — không sửa tay.")
w("// Có thể thay bằng: npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts")
w("")
w("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];")
w("")
w("export type Database = {")
w("  public: {")
w("    Tables: {")
for t, cs in tables.items():
    w(f"      {t}: {{")
    w("        Row: {")
    for c in cs:
        typ = ts_type(c["data_type"], c["udt_name"])
        null = " | null" if c["is_nullable"] == "YES" else ""
        w(f"          {c['column_name']}: {typ}{null};")
    w("        };")
    for kind in ("Insert", "Update"):
        w(f"        {kind}: {{")
        for c in cs:
            typ = ts_type(c["data_type"], c["udt_name"])
            null = " | null" if c["is_nullable"] == "YES" else ""
            optional = kind == "Update" or c["is_nullable"] == "YES" or c["column_default"] is not None
            w(f"          {c['column_name']}{'?' if optional else ''}: {typ}{null};")
        w("        };")
    w("        Relationships: [")
    for fk in [f for f in fks if f["table_name"] == t]:
        one = tuple(fk["cols"]) in unique_sets.get(t, [])
        w("          {")
        w(f"            foreignKeyName: \"{fk['name']}\";")
        w(f"            columns: {json.dumps(fk['cols'])};")
        w(f"            isOneToOne: {'true' if one else 'false'};")
        w(f"            referencedRelation: \"{fk['ref_table']}\";")
        w(f"            referencedColumns: {json.dumps(fk['ref_cols'])};")
        w("          },")
    w("        ];")
    w("      };")
w("    };")
w("    Views: { [_ in never]: never };")
w("    Functions: {")
for f in funcs:
    args = parse_args(f["args"])
    w(f"      {f['name']}: {{")
    if args:
        w("        Args: {")
        for name, typ, has_default in args:
            w(f"          {name}{'?' if has_default else ''}: {typ};")
        w("        };")
    else:
        w("        Args: never;")
    res = f["result"]
    if res.startswith("TABLE("):
        w("        Returns: {")
        for name, typ in parse_table_result(res):
            w(f"          {name}: {typ};")
        w("        }[];")
    elif res.startswith("SETOF "):
        rel = res[len("SETOF "):]
        w(f"        Returns: Database[\"public\"][\"Tables\"][\"{rel}\"][\"Row\"][];")
    else:
        w(f"        Returns: {arg_ts(res)};")
    w("      };")
w("    };")
w("    Enums: { [_ in never]: never };")
w("    CompositeTypes: { [_ in never]: never };")
w("  };")
w("};")
w("")
w("type PublicTables = Database[\"public\"][\"Tables\"];")
w("export type Tables<T extends keyof PublicTables> = PublicTables[T][\"Row\"];")
w("export type TablesInsert<T extends keyof PublicTables> = PublicTables[T][\"Insert\"];")
w("export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T][\"Update\"];")
print("\n".join(lines))
