"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, IMAGE_SIZES, type ImageSize } from "@/lib/catalog";
import { deleteImage, listImages, putImage, type StoredImage } from "@/lib/imageStore";
import { uid } from "@/lib/storage";
import { apiError, Button, ErrorBanner, FIELD, IconButton, PageIntro, Spinner } from "@/components/ui";
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
  "A peacock made of stained glass, intricate detail, backlit",
  "Futuristic Bengaluru skyline at night with flying auto-rickshaws, neon, rain",
  "Minimal flat logo of a speech bubble turning into a sound wave, black and white",
  "Watercolour painting of a Kerala backwater houseboat at sunset",
];

function aspect(size: string) {
  const [w, h] = size.split("x").map(Number);
  return `${w} / ${h}`;
}

function fileName(img: StoredImage) {
  return `callmissed-${img.id.slice(0, 8)}.${img.image.startsWith("data:image/jpeg") ? "jpg" : "png"}`;
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
    <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start gap-10 px-4 py-10 sm:px-8 sm:py-12">
      <form
        aria-label="Generate an image"
        className="flex min-w-0 flex-[1_1_340px] flex-col gap-7 lg:max-w-[400px]"
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <PageIntro eyebrow="Image studio" title="Describe it." />

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label htmlFor="prompt" className="text-sm font-medium">
              Prompt
            </label>
            <button
              type="button"
              onClick={() => setPrompt(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-muted transition hover:text-text"
            >
              <IconSparkle width={13} height={13} /> Surprise me
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
            placeholder="A small red paper boat on calm blue water…"
            className={`${FIELD} resize-y py-3.5 leading-relaxed`}
          />
        </div>

        <fieldset>
          <legend className="mb-2.5 text-sm font-medium">Model</legend>
          <div className="border-t border-border">
            {IMAGE_MODELS.map((m) => {
              const on = model === m.id;
              return (
                <label
                  key={m.id}
                  className="flex min-h-[60px] cursor-pointer items-center gap-3.5 border-b border-border px-1 py-2.5"
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    checked={on}
                    onChange={() => setModel(m.id)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text ${
                      on ? "bg-accent" : "border-[1.5px] border-border-strong"
                    }`}
                  />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-medium">{m.label}</span>
                    <span className="text-[13px] text-muted">{m.speed}</span>
                  </span>
                  <span className="font-mono text-xs text-muted">{m.credits} cr</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-medium">Size</legend>
          <div className="flex flex-wrap gap-2">
            {IMAGE_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={size === s}
                onClick={() => setSize(s)}
                className={`h-11 rounded-full border px-4 text-sm transition ${
                  size === s ? "border-text bg-text text-bg" : "border-border-strong bg-surface hover:border-text"
                }`}
              >
                {SIZE_LABELS[s]}
              </button>
            ))}
          </div>
        </fieldset>

        <details className="group border-y border-border">
          <summary className="flex cursor-pointer items-center justify-between py-3.5 text-sm font-medium select-none">
            Advanced
            <span aria-hidden="true" className="font-mono text-muted transition group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="flex flex-col gap-4 pb-5">
            <label className="flex flex-col gap-2 text-[13px] text-muted">
              Negative prompt{model === "lucid-origin" && " (not supported by Lucid Origin)"}
              <input
                value={negative}
                maxLength={500}
                disabled={model === "lucid-origin"}
                onChange={(e) => setNegative(e.target.value)}
                placeholder="blurry, low quality, watermark"
                className={`${FIELD} h-11 disabled:opacity-50`}
              />
            </label>
            <label className="flex flex-col gap-2 text-[13px] text-muted">
              Seed — leave blank for random
              <input
                value={seed}
                inputMode="numeric"
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="42"
                className={`${FIELD} h-11 font-mono`}
              />
            </label>
          </div>
        </details>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <Button type="submit" variant="primary" disabled={pending || prompt.trim().length < 3} className="h-14 text-base">
          {pending ? (
            <>
              <Spinner /> Generating…
            </>
          ) : (
            <>
              Generate <span className="font-mono text-[13px] opacity-60">· {selected.credits} credits</span>
            </>
          )}
        </Button>
      </form>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
        {pending ? (
          <div className="skeleton w-full rounded-3xl" style={{ aspectRatio: aspect(size) }} aria-label="Generating image" />
        ) : current ? (
          <figure className="flex flex-col gap-4">
            <button type="button" onClick={() => setLightbox(current)} className="overflow-hidden rounded-3xl bg-surface-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
              <img src={current.image} alt={current.prompt} className="w-full" />
            </button>
            <figcaption className="flex flex-wrap items-center justify-between gap-3">
              <span className="line-clamp-2 min-w-0 flex-1 text-[15px] text-muted">{current.prompt}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">
                  {IMAGE_MODELS.find((m) => m.id === current.model)?.label ?? current.model} ·{" "}
                  {current.size.replace("x", " × ")}
                </span>
                <ImageActions img={current} onReuse={reuse} />
              </span>
            </figcaption>
          </figure>
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-3xl border border-dashed border-border-strong text-center text-muted">
            <div>
              <IconImage width={32} height={32} className="mx-auto mb-3" />
              <p className="text-sm">Your image will appear here.</p>
            </div>
          </div>
        )}

        {gallery.length > 0 && (
          <section aria-labelledby="history" className="flex flex-col gap-4 border-t border-border pt-5">
            <h2 id="history" className="label font-normal">
              History · saved in this browser
            </h2>
            <ul className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
              {gallery.map((img) => (
                <li key={img.id}>
                  <button
                    type="button"
                    onClick={() => setCurrent(img)}
                    aria-pressed={current?.id === img.id}
                    className={`block aspect-square w-full overflow-hidden rounded-xl ${
                      current?.id === img.id ? "outline-2 outline-offset-2 outline-text" : ""
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

      {lightbox && <Lightbox img={lightbox} onClose={() => setLightbox(null)} onReuse={reuse} onDelete={remove} />}
    </div>
  );
}

function ImageActions({ img, onReuse }: { img: StoredImage; onReuse: (i: StoredImage) => void }) {
  return (
    <span className="flex items-center">
      <a
        href={img.image}
        download={fileName(img)}
        aria-label="Download"
        title="Download"
        className="inline-grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text"
      >
        <IconDownload width={16} height={16} />
      </a>
      <IconButton label="Copy prompt" onClick={() => navigator.clipboard.writeText(img.prompt)}>
        <IconCopy width={16} height={16} />
      </IconButton>
      <IconButton label="Reuse settings" onClick={() => onReuse(img)}>
        <IconRefresh width={16} height={16} />
      </IconButton>
    </span>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-bg md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img src={img.image} alt={img.prompt} className="max-h-[65vh] w-auto object-contain md:max-h-[85vh]" />
        </div>
        <div className="flex w-full flex-col gap-5 p-6 md:w-80">
          <div className="flex items-start justify-between gap-2">
            <p className="label pt-2">Details</p>
            <IconButton label="Close" onClick={onClose}>
              <IconX width={18} height={18} />
            </IconButton>
          </div>
          <p className="text-[15px] leading-relaxed">{img.prompt}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 font-mono text-xs">
            <dt className="text-muted">Model</dt>
            <dd>{model?.label ?? img.model}</dd>
            <dt className="text-muted">Size</dt>
            <dd>{img.size.replace("x", " × ")}</dd>
            {img.seed !== undefined && (
              <>
                <dt className="text-muted">Seed</dt>
                <dd>{img.seed}</dd>
              </>
            )}
            <dt className="text-muted">Created</dt>
            <dd>{new Date(img.createdAt).toLocaleString()}</dd>
          </dl>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button onClick={() => onReuse(img)}>
              <IconRefresh width={15} height={15} /> Reuse
            </Button>
            <a
              href={img.image}
              download={fileName(img)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong px-5 text-sm font-medium transition hover:border-text"
            >
              <IconDownload width={15} height={15} /> Download
            </a>
            <Button variant="ghost" onClick={() => onDelete(img)} className="text-danger hover:text-danger">
              <IconTrash width={15} height={15} /> Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
