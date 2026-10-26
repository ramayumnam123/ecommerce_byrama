"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ImagePlus, Link2, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap, uploadImage } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { mediaUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export type EditableImage = {
  id?: string;
  url: string;
  alt_text?: string | null;
  sort_order?: number;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUploader({
  images,
  onChange,
  max = 10,
}: {
  images: EditableImage[];
  onChange: (images: EditableImage[]) => void;
  max?: number;
}) {
  const [uploading, setUploading] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [manualUrl, setManualUrl] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const remaining = Math.max(0, max - images.length);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, remaining);
    if (list.length < Array.from(files).length) {
      toast.message(`Only ${remaining} more image${remaining === 1 ? "" : "s"} allowed`);
    }
    if (!list.length) return;

    setUploading(list.length);
    setProgress(0);
    let done = 0;

    for (const file of list) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name}: use JPEG, PNG or WebP`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: images are capped at 5 MB`);
        continue;
      }
      try {
        const presigned = (await unwrap(
          await api.POST("/api/media/presign", {
            body: {
              filename: file.name,
              content_type: file.type as "image/jpeg" | "image/png" | "image/webp",
            },
          }),
        )) as unknown as { upload_url: string; public_url: string };

        await uploadImage(presigned.upload_url, file);
        onChange([
          ...images,
          {
            url: presigned.public_url,
            alt_text: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          },
        ]);
        toast.success(`${file.name} uploaded`);
      } catch (error) {
        toast.error(messageForError(error));
      } finally {
        done += 1;
        setProgress(Math.round((done / list.length) * 100));
        setUploading((count) => Math.max(0, count - 1));
      }
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((image, i) => ({ ...image, sort_order: i })));
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index).map((image, i) => ({ ...image, sort_order: i })));
  }

  function addManual() {
    const url = manualUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      toast.error("Paste a full https:// image URL");
      return;
    }
    onChange([...images, { url, alt_text: "" }]);
    setManualUrl("");
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-foreground bg-accent/30" : "hover:border-foreground/40"
        } ${remaining === 0 ? "pointer-events-none opacity-50" : ""}`}
      >
        {uploading > 0 ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud className="size-6 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {uploading > 0
            ? `Uploading ${uploading} image${uploading === 1 ? "" : "s"}…`
            : "Drop images here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG or WebP · up to 5 MB · {remaining} of {max} slots left
        </p>
        {uploading > 0 ? <Progress value={progress} className="mt-2 w-56" /> : null}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="manual-image-url">Or paste an image URL</Label>
          <Input
            id="manual-image-url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://images.example.com/photo.jpg"
            disabled={remaining === 0}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addManual}
          disabled={!manualUrl.trim() || remaining === 0}
        >
          <Link2 /> Add URL
        </Button>
      </div>

      {images.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <ImagePlus className="size-4" /> The first image becomes the listing cover.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {images.map((image, index) => {
            const src = mediaUrl(image.url);
            return (
              <li key={`${image.url}-${index}`} className="space-y-2 rounded-lg border bg-card p-2">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {src ? (
                    <Image
                      src={src}
                      alt={image.alt_text || `Product image ${index + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover"
                    />
                  ) : null}
                  {index === 0 ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                      Cover
                    </span>
                  ) : null}
                </div>
                <Input
                  value={image.alt_text ?? ""}
                  onChange={(e) => {
                    const next = [...images];
                    next[index] = { ...next[index], alt_text: e.target.value };
                    onChange(next);
                  }}
                  placeholder="Alt text"
                  aria-label={`Alt text for image ${index + 1}`}
                  className="h-8 text-xs"
                />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move image up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move image down"
                      disabled={index === images.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove image"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
