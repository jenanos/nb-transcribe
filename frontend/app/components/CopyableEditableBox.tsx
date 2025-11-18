"use client";

import { useEffect, useRef, useState } from "react";

type CopyableEditableBoxProps = {
  title: string;
  content: string;
};

export default function CopyableEditableBox({
  title,
  content,
}: CopyableEditableBoxProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(content);
  const [copied, setCopied] = useState(false);
  const lastContentRef = useRef(content);

  useEffect(() => {
    if (!isEditing && content !== lastContentRef.current) {
      lastContentRef.current = content;
      setText(content);
      return;
    }

    lastContentRef.current = content;
  }, [content, isEditing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("clipboard error", err);
    }
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-white/10 bg-black/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <h3 className="font-orbitron text-xl text-pink-400">{title}</h3>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="text-cyan-300 hover:text-white transition-colors"
            title="Kopier"
            type="button"
          >
            📋
          </button>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-cyan-300 hover:text-white transition-colors"
              title="Rediger"
              type="button"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="h-64 w-full rounded-md border border-pink-400 bg-black/50 p-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <button
            onClick={handleSave}
            className="self-start rounded bg-pink-500 px-4 py-2 hover:bg-pink-600"
            type="button"
          >
            Lagre
          </button>
        </div>
      ) : (
        <div className="max-h-96 min-h-[16rem] overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-3">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{text}</pre>
        </div>
      )}

      {copied && (
        <div className="absolute right-12 top-2 rounded bg-cyan-500 px-2 py-1 text-sm text-black">
          Kopiert!
        </div>
      )}
    </div>
  );
}
