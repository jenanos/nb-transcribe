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
    <div className="relative p-4 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
      <div className="flex justify-between items-center mb-2">
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
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full p-2 bg-black/50 text-white border border-pink-400 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <button
            onClick={handleSave}
            className="mt-2 px-4 py-2 bg-pink-500 rounded hover:bg-pink-600"
            type="button"
          >
            Lagre
          </button>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap">{text}</pre>
      )}

      {copied && (
        <div className="absolute top-2 right-12 bg-cyan-500 text-black px-2 py-1 rounded text-sm">
          Kopiert!
        </div>
      )}
    </div>
  );
}
