"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.includes("@")) {
          toast.error("Enter a valid email address");
          return;
        }
        toast.success("You're on the list", {
          description: "Look out for the first note soon.",
        });
        setEmail("");
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        aria-label="Email address for newsletter"
        className="h-10 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus:border-ring"
      />
      <Button type="submit" variant="outline" size="icon" aria-label="Subscribe">
        <ArrowRight />
      </Button>
    </form>
  );
}
