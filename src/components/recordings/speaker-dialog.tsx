"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { speakerDisplay } from "@/lib/transcription/format";
import type { Speaker } from "@/lib/transcription/types";

export function SpeakerDialog({
  open,
  onOpenChange,
  speaker,
  speakers,
  onRename,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  speaker: Speaker;
  speakers: Speaker[];
  onRename: (key: string, name: string, role: string | null) => void;
  onMerge: (from: string, into: string) => void;
}) {
  const [name, setName] = useState(speaker.name);
  const [role, setRole] = useState(speaker.role ?? "");
  const [mergeInto, setMergeInto] = useState<string>("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Người nói</DialogTitle>
          <DialogDescription>Đổi tên hiển thị hoặc gộp với người nói khác (khi AI tách nhầm một người thành hai).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tên hiển thị</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Thầy Hiển" />
          </div>
          <div className="space-y-1.5">
            <Label>Vai trò</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="VD: Chủ tọa, Người trình bày, Thư ký" />
          </div>
          <div className="space-y-1.5 rounded-lg border p-3">
            <Label>Gộp vào người nói khác</Label>
            <Select value={mergeInto} onValueChange={setMergeInto}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn người nói" />
              </SelectTrigger>
              <SelectContent>
                {speakers
                  .filter((s) => s.key !== speaker.key)
                  .map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {speakerDisplay(s.key, speakers)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!mergeInto}
              onClick={() => {
                onMerge(speaker.key, mergeInto);
                onOpenChange(false);
              }}
            >
              Gộp toàn bộ câu của “{speaker.name}” vào người đã chọn
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            onClick={() => {
              onRename(speaker.key, name, role.trim() || null);
              onOpenChange(false);
            }}
          >
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
