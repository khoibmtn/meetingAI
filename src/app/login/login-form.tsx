"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setLoading("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo(), queryParams: { prompt: "select_account" } },
    });
    if (error) {
      toast.error(error.message);
      setLoading(null);
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading("signin");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(null);
    if (error) return toast.error(error.message === "Invalid login credentials" ? "Email hoặc mật khẩu không đúng" : error.message);
    router.replace(next);
    router.refresh();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Mật khẩu tối thiểu 8 ký tự");
    setLoading("signup");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo(), data: { full_name: fullName } },
    });
    setLoading(null);
    if (error) return toast.error(error.message);
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      toast.success("Đã gửi email xác nhận — vui lòng kiểm tra hộp thư.");
    }
  }

  async function magicLink() {
    if (!email) return toast.error("Nhập email trước");
    setLoading("magic");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setLoading(null);
    if (error) return toast.error(error.message);
    toast.success("Đã gửi liên kết đăng nhập tới email của bạn.");
  }

  return (
    <div className="space-y-5">
      <Button variant="outline" className="h-10 w-full" onClick={google} disabled={!!loading}>
        {loading === "google" ? <Spinner /> : <GoogleIcon />} Tiếp tục với Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> hoặc <div className="h-px flex-1 bg-border" />
      </div>
      <Tabs defaultValue="signin">
        <TabsList className="w-full">
          <TabsTrigger value="signin">Đăng nhập</TabsTrigger>
          <TabsTrigger value="signup">Tạo tài khoản</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <form onSubmit={signIn} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={!!loading}>
              {loading === "signin" ? <Spinner /> : null} Đăng nhập
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={magicLink} disabled={!!loading}>
              {loading === "magic" ? <Spinner /> : <MailIcon />} Gửi liên kết đăng nhập qua email
            </Button>
          </form>
        </TabsContent>
        <TabsContent value="signup">
          <form onSubmit={signUp} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Họ và tên</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="VD: BS. Nguyễn Văn A" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email2">Email</Label>
              <Input id="email2" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password2">Mật khẩu (≥ 8 ký tự)</Label>
              <Input id="password2" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={!!loading}>
              {loading === "signup" ? <Spinner /> : null} Tạo tài khoản
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
