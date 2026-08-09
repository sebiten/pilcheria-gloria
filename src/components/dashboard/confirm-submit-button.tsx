"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmSubmitButtonProps extends ComponentProps<typeof Button> {
  confirmation: string;
}

export function ConfirmSubmitButton({
  confirmation,
  onClick,
  ...props
}: ConfirmSubmitButtonProps) {
  return (
    <Button
      {...props}
      type="submit"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    />
  );
}
