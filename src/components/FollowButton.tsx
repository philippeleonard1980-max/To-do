"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";

import { Button } from "./ui";

export function FollowButton({
  username,
  initialFollowing,
  signedIn,
}: {
  username: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/users/${username}/follow`, { method: "POST" });
    setBusy(false);
    if (!response.ok) return;
    const data = await response.json();
    setFollowing(data.following);
    router.refresh();
  }

  return (
    <Button variant={following ? "outline" : "primary"} onClick={toggle} loading={busy}>
      {following ? <UserMinus size={15} /> : <UserPlus size={15} />}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
