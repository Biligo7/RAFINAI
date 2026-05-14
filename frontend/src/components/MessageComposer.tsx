import { useState, type KeyboardEvent } from "react";

interface Props {
  disabled: boolean;
  onSend: (content: string) => void;
  placeholder?: string;
}

export function MessageComposer({ disabled, onSend, placeholder }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer">
      <div className="inner">
        <textarea
          value={value}
          placeholder={placeholder ?? "Send a message. Shift+Enter for newline."}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <button onClick={submit} disabled={disabled || !value.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
