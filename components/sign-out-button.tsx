"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button type="button" className="ghost-button" onClick={() => signOut({ callbackUrl: "/" })}>
      ログアウト
    </button>
  );
}
