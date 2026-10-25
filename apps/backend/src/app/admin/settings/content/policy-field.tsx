"use client";
import { useState } from "react";
import { Textarea } from "@supastore/ui/textarea";
import { Button } from "@supastore/ui/button";
export function PolicyField({
  name,
  initial,
  starter,
}: {
  name: string;
  initial: string;
  starter?: string | undefined;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Textarea
        id={name}
        name={name}
        rows={7}
        maxLength={10000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {starter && !value && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setValue(starter)}
        >
          Insert starter for review
        </Button>
      )}
    </>
  );
}
