"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /login は廃止。ホーム画面にリダイレクト
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return null;
}
