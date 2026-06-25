"use client";

import Link from "next/link";
import Image from "next/image";

export default function Avatar() {
  return (
    <Link href="/profile" className="block">
      <Image
        src="/avatar.jpeg"
        alt="Profil"
        width={36}
        height={36}
        className="w-9 h-9 rounded-full object-cover"
      />
    </Link>
  );
}
