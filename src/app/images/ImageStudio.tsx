"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, IMAGE_SIZES, type ImageSize } from "@/lib/catalog";
import { deleteImage, listImages, putImage, type StoredImage } from "@/lib/imageStore";
import { uid } from "@/lib/storage";
import { apiError, Button, ErrorBanner, IconButton, PageHeader, Spinner } from "@/components/ui";
import { IconCopy, IconDownload, IconImage, IconRefresh, IconSparkle, IconTrash, IconX } from "@/components/icons";

const SIZE_LABELS: Record<ImageSize, string> = {
  "1024x1024": "Square",
  "768x768": "Small square",
  "1024x1536": "Portrait",
  "1536x1024": "Landscape",
};

const IDEAS = [
  "A cosy Mumbai chai stall at dawn, warm light, steam rising, cinematic photography",
  "Isometric illustration of a tiny call centre run by friendly robots, pastel colours",
  "A peacock made of stained glass, intricate detail, backlit, 4k",
  "Futuristic Bengaluru skyline at night with flying auto-rickshaws, neon, rain",
  "Minimal flat logo concept of a speech bubble turning into a sound wave, indigo and white",
  "Watercolour painting of a Kerala backwater houseboat at sunset",
];

function aspect(size: string) {
  const [w, h] = size.split("x").map(Number);
  return `${w} / ${h}`;
}

export function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [model, setModel] = useState(DEFAULT_IMAGE_MODEL);
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [seed, setSeed] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<StoredImage[]>([]);
  const [current, setCurrent] = useState<StoredImage | null>(null);
  const [lightbox, setLightbox] = useState<StoredImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    listImages().then((imgs) => {
      setGallery(imgs);
      setCurrent((c) => c ?? imgs[0] ?? null);
    });
    return () => abortRef.current?.abort();
  }, []);

  const selected = IMAGE_MODELS.find((m) => m.id === model)!;

  const generate = async () => {
    if (prompt.trim().length < 3 || pending) return;
    setPending(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const seedNum = seed.trim() === "" ? undefined : Number(seed);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, negativePrompt: negative, model, size, seed: seedNum }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json();
      const img: StoredImage = {
        id: uid(),
        image: data.image,
        prompt: data.prompt,
        negativePrompt: negative || undefined,
        model: data.model,
        size: data.size,
        seed: seedNum,
        createdAt: Date.now(),
      };
      await putImage(img);
      setGallery((g) => [img, ...g]);
      setCurrent(img);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const reuse = (img: StoredImage) => {
    setPrompt(img.prompt);
    setNegative(img.negativePrompt ?? "");
    setModel(img.model);
    setSize(img.size as ImageSize);
    setSeed(img.seed !== undefined ? String(img.seed) : "");
    setLightbox(null);
  };

  const remove = async (img: StoredImage) => {
    await deleteImage(img.id);
    setGallery((g) => g.filter((x) => x.id !== img.id));
    if (current?.id === img.id) setCurrent(null);
    setLightbox(null);
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Image studio" subtitle="Text-to-image with FLUX, Leonardo and SDXL models on CallMissed" />

      <div className="grid flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        {/* Controls */}
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="prompt" className="text-sm font-medium">
                Prompt
              </label>
              <button
                type="button"
                onClick={() => setPrompt(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <IconSparkle width={14} height={14} /> Surprise me
              </button>
            </div>
            <textarea
              id="prompt"
              rows={4}
              value={prompt}
              maxLength={1000}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
              }}
              placeholder="Describe the image you want…"
              className="resize-y rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Model</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {IMAGE_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`cursor-pointer rounded-xl border p-3 text-sm transition ${
                    model === m.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    checked={model === m.id}
                    onChange={() => setModel(m.id)}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {m.label}
                    <span className="text-xs font-normal text-muted">{m.credits} cr</span>
                  </span>
                  <span className="text-xs text-muted">{m.speed}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Size</legend>
            <div className="flex flex-wrap gap-2">
              {IMAGE_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={size === s}
                  onClick={() => setSize(s)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                    size === s ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-text"
                  }`}
                >
                  <span
                    className="inline-block w-3.5 rounded-[2px] border border-current"
                    style={{ aspectRatio: aspect(s) }}
                    aria-hidden="true"
                  />
                  {SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>

          <details className="rounded-xl border border-border bg-surface">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium select-none">Advanced</summary>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Negative prompt {model === "lucid-origin" && <span>(not supported by Lucid Origin)</span>}
                <input
                  value={negative}
                  maxLength={500}
                  disabled={model === "lucid-origin"}
                  onChange={(e) => setNegative(e.target.value)}
                  placeholder="blurry, low quality, text, watermark"
                  className="h-9 rounded-lg border border-border bg-bg px-2.5 text-sm font-normal text-text outline-none focus:border-accent disabled:opacity-50"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Seed (blank = random)
                <input
                  value={seed}
                  inputMode="numeric"
                  onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="e.g. 42"
                  className="h-9 rounded-lg border border-border bg-bg px-2.5 text-sm font-normal text-text outline-none focus:border-accent"
                />
              </label>
            </div>
          </details>

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <Button type="submit" variant="primary" disabled={pending || prompt.trim().length < 3} className="h-11">
            {pending ? (
              <>
                <Spinner /> Generating…
              </>
            ) : (
              <>
                <IconSparkle width={18} height={18} /> Generate · {selected.credits} credits
              </>
            )}
          </Button>
        </form>

        {/* Preview + gallery */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border bg-surface p-3">
            {pending ? (
              <div
                className="skeleton w-full max-w-xl rounded-xl"
                style={{ aspectRatio: aspect(size) }}
                aria-label="Generating image"
              />
            ) : current ? (
              <figure className="flex w-full max-w-xl flex-col gap-3">
                <button type="button" onClick={() => setLightbox(current)} className="overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
                  <img src={current.image} alt={current.prompt} className="w-full" />
                </button>
                <figcaption className="flex items-start gap-2">
                  <p className="line-clamp-2 flex-1 text-sm text-muted">{current.prompt}</p>
                  <ImageActions img={current} onReuse={reuse} />
                </figcaption>
              </figure>
            ) : (
              <div className="text-center text-muted">
                <IconImage width={40} height={40} className="mx-auto mb-3 opacity-60" />
                <p className="text-sm">Your generated image will appear here.</p>
              </div>
            )}
          </div>

          {gallery.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium">
                History <span className="font-normal text-muted">· saved in this browser</span>
              </h2>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {gallery.map((img) => (
                  <li key={img.id}>
                    <button
                      type="button"
                      onClick={() => setCurrent(img)}
                      className={`block aspect-square w-full overflow-hidden rounded-lg border-2 ${
                        current?.id === img.id ? "border-accent" : "border-transparent"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL from IndexedDB */}
                      <img src={img.image} alt={img.prompt} className="size-full object-cover" loading="lazy" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {lightbox && <Lightbox img={lightbox} onClose={() => setLightbox(null)} onReuse={reuse} onDelete={remove} />}
    </div>
  );
}

function ImageActions({ img, onReuse }: { img: StoredImage; onReuse: (i: StoredImage) => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <a
        href={img.image}
        download={`callmissed-${img.id.slice(0, 8)}.${img.image.startsWith("data:image/jpeg") ? "jpg" : "png"}`}
        aria-label="Download"
        title="Download"
        className="inline-grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
      >
        <IconDownload width={16} height={16} />
      </a>
      <IconButton label="Copy prompt" onClick={() => navigator.clipboard.writeText(img.prompt)}>
        <IconCopy width={16} height={16} />
      </IconButton>
      <IconButton label="Reuse settings" onClick={() => onReuse(img)}>
        <IconRefresh width={16} height={16} />
      </IconButton>
    </div>
  );
}

function Lightbox({
  img,
  onClose,
  onReuse,
  onDelete,
}: {
  img: StoredImage;
  onClose: () => void;
  onReuse: (i: StoredImage) => void;
  onDelete: (i: StoredImage) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const model = IMAGE_MODELS.find((m) => m.id === img.model);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image details"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img src={img.image} alt={img.prompt} className="max-h-[70vh] w-auto object-contain md:max-h-[85vh]" />
        </div>
        <div className="flex w-full flex-col gap-3 p-4 md:w-72">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-medium">Details</h2>
            <IconButton label="Close" onClick={onClose}>
              <IconX />
            </IconButton>
          </div>
          <p className="text-sm">{img.prompt}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
            <dt>Model</dt>
            <dd className="text-text">{model?.label ?? img.model}</dd>
            <dt>Size</dt>
            <dd className="text-text">{img.size}</dd>
            {img.seed !== undefined && (
              <>
                <dt>Seed</dt>
                <dd className="text-text">{img.seed}</dd>
              </>
            )}
            <dt>Created</dt>
            <dd className="text-text">{new Date(img.createdAt).toLocaleString()}</dd>
          </dl>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button onClick={() => onReuse(img)}>
              <IconRefresh width={16} height={16} /> Reuse
            </Button>
            <a
              href={img.image}
              download={`callmissed-${img.id.slice(0, 8)}.png`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
            >
              <IconDownload width={16} height={16} /> Download
            </a>
            <Button variant="ghost" onClick={() => onDelete(img)} className="text-danger">
              <IconTrash width={16} height={16} /> Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
