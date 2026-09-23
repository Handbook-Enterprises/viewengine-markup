import { CommentPopover } from '@ext/components/CommentPopover';
import { InspectorLayer } from '@ext/components/InspectorLayer';
import { Toasts } from '@ext/components/Toasts';
import { Toolbar } from '@ext/components/Toolbar';
import { activeTool, color, comments as commentsComputed, isDrawingTool, lineWidth, selections } from '@ext/lib/state';
import type { TextOp } from '@ext/lib/types';
import { cn, UPLOAD_ACCEPT } from '@marklayer/types';
import { useSignal } from '@preact/signals';
import { ArrowRight, Monitor, Search } from 'lucide-preact';
import { nanoid } from 'nanoid';
import { useRef } from 'preact/hooks';
import { FakeCursors } from './FakeCursors';
import { frameViewport } from './iframeOverlay';
import { useHeroPin } from './landing/useHeroPin';
import { useLandingCanvas } from './landing/useLandingCanvas';
import { useLandingPresence } from './landing/useLandingPresence';
import { useLandingShortcuts } from './landing/useLandingShortcuts';
import { useLandingUpload } from './landing/useLandingUpload';
import { SelfCursor } from './SelfCursor';
import { Logo, TextInputOverlay } from './shared';
import {
  commentPopover,
  embedInView,
  isMobileDevice,
  navigateTo,
  pushDeviceOp,
  selectionPopover,
  textInput,
  urlReady,
} from './signals';
import { WebCommentPin } from './WebCommentPin';
import { WebSelectionHighlight } from './WebSelectionHighlight';
import { WebSelectionPopover } from './WebSelectionPopover';

/**
 * The marketing page, which is also a live board: every mark on the first screen
 * is a real op on the real op stream, drawn with the product's own canvas and
 * toolbar.
 *
 * The behaviour that makes that true lives in `./landing` — the drawing engine,
 * the keyboard layer, the seeded pin, uploads and presence each as one hook — so
 * what is left here is the composition. It was one 1,277-line component with all
 * six concerns interleaved above the JSX.
 */
export function Landing() {
  const heroFormRef = useRef<HTMLFormElement>(null);
  const { canvasRef, onDown } = useLandingCanvas();
  const { fileInputRef, uploading, uploadFile } = useLandingUpload();
  // Drag state belongs to the drop zone below, which is the only thing that reads it.
  const dropping = useSignal(false);
  useLandingShortcuts();
  useLandingPresence();
  useHeroPin(heroFormRef);

  const tool = activeTool.value;
  const showCanvas = isDrawingTool(tool) && tool !== 'comment' && tool !== 'text' && tool !== 'selection';
  const showTextCursor = tool === 'text';
  const showCommentCursor = tool === 'comment';
  const comments = commentsComputed.value;

  return (
    <>
      {/* The board.

          The page is not a page *about* an annotation tool; it is a page that
          has been annotated. Every mark on this first screen is real — the
          canvas is the product's canvas, the toolbar is the product's toolbar,
          the strokes are real ops and the highlight under the headline is the
          highlighter tool's own 40%-alpha swipe. Nothing here is a drawing of
          the product pretending to be the product. */}
      <div class="ml-force-light lp-voice relative min-h-screen overflow-x-clip lp-board">
        {/* No page-wide column. The content column used to be 800px wide on any
            viewport, which read as a narrow tube down the middle of a dead white
            field — packed inside, empty outside. Each section now owns its own
            width, and the live annotation layer gets the outer margins. */}
        <main class="min-h-screen sm:min-h-0">
          {/* The first screen is composed as one frame: nav, hero and the board
              line share a 100svh column, so the fold ends where the composition
              ends instead of letting the next section peek in 151px high and
              unaligned. */}
          <div class="relative flex flex-col sm:min-h-[100svh]">
            {/* The demo cursors belong to this frame and scroll away with it. */}
            <FakeCursors />

            {/* Nav. It carries real navigation now — the page previously had a
                logo, two icons and no links at all, while the footer carried
                twenty. Contained to the same column the hero sits in, so the
                wordmark and the headline share one left margin. */}
            <nav class="lp-fade-up relative z-1 mx-auto flex w-full max-w-page items-center justify-between gap-6 px-6 pt-6 sm:px-10">
              <a href="/" class="flex items-center gap-2.5 no-underline">
                <Logo size={34} />
                {/* Solid ink. A gradient clipped into the wordmark is decoration
                  the eye reads as a rendering artifact at this size. The
                  wordmark tracks the mark's size so the lockup keeps its
                  proportion instead of the glyph outgrowing the name. */}
                <span class="text-heading font-medium tracking-brand text-ml-fg">ViewEngine Markup</span>
              </a>
            </nav>

            {/* Hero. Left-anchored on the same margin as the wordmark, not
                centred: seven stacked centre-aligned rows floating in an empty
                field is the default hero stack, and it left the whole right of
                the screen reading as dead space rather than as board. The copy
                holds the left; the board's working area — where the marks and
                the other people's cursors are — holds the right. */}
            <section class="relative mx-auto flex w-full max-w-page flex-1 flex-col justify-center px-6 pb-28 pt-14 sm:px-10 sm:pb-36 sm:pt-8">
              <div class="max-w-[1080px]">
                {/* Two lines, never three — the measure is set wide enough that
                  the longest channel word ("WhatsApp") still lands on line two
                  rather than starting a third. The display statement spans the
                  column while the action block below it stays on a reading
                  measure, so the fold is a wide headline over a left-anchored
                  column rather than a text block with dead space beside it.

                  The cycling word carries a live highlighter mark (see
                  ChannelCycle) which holds the slot through the ~300ms the
                  glyphs spend at zero opacity — before, the headline showed a
                  hole mid-swap. */}
                {/* The two lines are explicit, and `text-balance` is
                  deliberately absent.

                  Left to wrap on its own the headline re-broke every time the
                  channel word swapped — "WhatsApp" is far wider than "Email", so
                  the line count changed under it and the entire page below
                  jumped on a 2.6s loop. Balancing made it worse, because
                  `text-wrap: balance` recomputes the break points on every width
                  change rather than holding them.

                  Splitting the lines by hand means only line two contains the
                  cycling slot, and that line is measured to hold the longest
                  channel name at the largest step of the clamp, so the block's
                  height is constant and the only thing that ever moves is
                  "Thread." sliding sideways — which is the intended effect.

                  Line one still wraps below ~430px, so the phone rendering is
                  three lines rather than two. That is fine and it is not the
                  bug this fixes: the wrap there is the same on every tick,
                  because it depends on the fixed prefix and not on which
                  channel word happens to be in the slot. */}
                <h1 class="lp-display lp-fade-up text-hero text-ml-fg" style={{ animationDelay: '0.05s' }}>
                  <span class="block">Mark up any page.</span>
                  <span class="block">Share one link.</span>
                </h1>
              </div>

              <p
                class="lp-fade-up mt-6 max-w-[44ch] text-lede leading-body text-ml-fg/70"
                style={{ animationDelay: '0.1s' }}
              >
                Paste a URL, draw and comment on the live page, then send the link to your team or client. No account
                needed to review.
              </p>

              {isMobileDevice ? (
                <div
                  class="lp-fade-up lp-panel mt-9 max-w-[400px] rounded-xl px-5 py-5"
                  style={{ animationDelay: '0.3s' }}
                >
                  <Monitor size={22} class="text-ml-fg/60 mb-3" aria-hidden="true" />
                  <p class="text-ui-lg font-semibold text-ml-fg m-0 mb-1">Desktop only</p>
                  <p class="text-ui text-ml-fg/60 m-0">Open this page on your computer to get started.</p>
                </div>
              ) : (
                <>
                  {/* The URL box leads, the extension follows. Installing is the
                    high-friction ask — a store visit and a permissions prompt —
                    while pasting a URL delivers the product in one step with
                    nothing to install. Leading with the install asked cold
                    traffic to commit before anything had been demonstrated. */}
                  <form
                    ref={heroFormRef}
                    class="lp-fade-up mt-9 max-w-[520px]"
                    style={{ animationDelay: '0.15s' }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      dropping.value = true;
                    }}
                    onDragLeave={(e) => {
                      // Fires when crossing into a child too; ignore those or the
                      // ring flickers as the pointer moves across the field.
                      const to = e.relatedTarget;
                      if (to instanceof Node && e.currentTarget.contains(to)) return;
                      dropping.value = false;
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropping.value = false;
                      const file = e.dataTransfer?.files?.[0];
                      if (file) void uploadFile(file);
                    }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const el = e.currentTarget.elements.namedItem('url');
                      if (!(el instanceof HTMLInputElement)) return;
                      const input = el.value.trim();
                      if (!input) return;
                      let url = input;
                      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
                      navigateTo({ url, source: 'hero_form' });
                    }}
                  >
                    {/* Pill, on the page's one elevation primitive: a hairline
                      ring and a 2px contact shadow, the same treatment every
                      other object on the board gets. The focus state tightens
                      the ring rather than adding a second one outside it. */}
                    <div
                      class="lp-panel lp-field flex items-center gap-3 rounded-full py-2 pl-5 pr-2"
                      data-dropping={dropping.value ? 'true' : undefined}
                    >
                      <Search size={17} class="text-ml-fg/60 shrink-0" aria-hidden="true" />
                      {/* 16px under `sm`: iOS Safari zooms the whole page when a
                        focused field's text is under 16px, and this is the first
                        thing anyone taps on the homepage. */}
                      {/* A placeholder is not a label — it is the only thing
                        naming this field, and it disappears the moment anyone
                        types. The hero composition has no room for a visible
                        label above the pill, so the name is carried for screen
                        readers instead of being left unsaid. */}
                      <input
                        name="url"
                        type="text"
                        inputMode="url"
                        aria-label="Page URL to annotate"
                        placeholder="Paste any URL to annotate…"
                        autocomplete="url"
                        class="h-10 flex-1 bg-transparent border-none text-ml-fg text-base sm:text-body placeholder:text-ml-fg/60 outline-none"
                        onInput={(e) => {
                          const v = e.currentTarget.value.trim();
                          urlReady.value = v.length > 0 && /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(v);
                        }}
                      />
                      <button
                        type="submit"
                        aria-label="Go"
                        class={cn(
                          'shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-full grid place-items-center border-none cursor-pointer transition-colors duration-200',
                          urlReady.value
                            ? 'text-ml-btn-fg bg-ml-btn hover:bg-[#383838]'
                            : 'text-ml-fg/60 bg-ml-fg/[0.05] hover:bg-ml-fg/[0.09]',
                        )}
                      >
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </form>

                  <div
                    class="lp-fade-up mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-ui-lg text-ml-fg/60"
                    style={{ animationDelay: '0.2s' }}
                  >
                    <span>Or try one:</span>
                    {[
                      { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Web_annotation' },
                      { name: 'Hacker News', url: 'https://news.ycombinator.com' },
                      { name: 'Product Hunt', url: 'https://www.producthunt.com/products/marklayer' },
                    ].map(({ name, url }) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          navigateTo({ url, source: `suggestion_${name.toLowerCase().replace(/\s+/g, '_')}` })
                        }
                        class="-my-3 inline-flex min-h-11 cursor-pointer items-center rounded border-none bg-transparent py-3 text-ui-lg text-ml-fg/70 underline underline-offset-2 decoration-ml-fg/30 transition-colors hover:text-ml-fg"
                      >
                        {name}
                      </button>
                    ))}
                    <span>or</span>
                    {/* Same underlined-text treatment as the suggestions beside
                      it: a local file is another way in, not a second action
                      worth its own filled button. */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      class="-my-3 inline-flex min-h-11 cursor-pointer items-center rounded border-none bg-transparent py-3 text-ui-lg text-ml-fg/70 underline underline-offset-2 decoration-ml-fg/30 transition-colors hover:text-ml-fg"
                    >
                      {uploading.value ? 'Uploading…' : 'open a PDF or image'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={UPLOAD_ACCEPT}
                      hidden
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        // Cleared so picking the same file twice still fires.
                        e.currentTarget.value = '';
                        if (file) void uploadFile(file);
                      }}
                    />
                  </div>
                </>
              )}
            </section>

            {/* The fold's floor, and the one line that makes the whole first
                screen legible: the toolbar docked below is the extension's own,
                and the strokes it draws are real ops on this page. Without it,
                three strangers' cursors drifting over the copy read as a
                rendering fault instead of as the product demonstrating itself.
                Sits above the docked toolbar and shares its centre line. */}
            <div
              class="lp-fade-up pointer-events-none absolute inset-x-0 bottom-6 hidden justify-center px-6 sm:flex sm:bottom-27"
              style={{ animationDelay: '0.3s' }}
            >
              <p class="m-0 text-ui text-ml-fg/60">
                This page is a live board. <span class="text-ml-fg">Pick a tool below and draw on it.</span>
              </p>
            </div>
          </div>
        </main>

        {/* Comment overlay.

            Absolute, spanning the document, with `scrollY` held at 0 — the same
            way the canvas below positions its ops. These layers used to be
            `fixed` and were handed `window.scrollY` read once during render;
            nothing re-renders them on scroll, so the subtraction went stale the
            moment the page moved and every pin sat frozen at a viewport offset,
            drifting across the sections below it. Document coordinates on a
            document-height layer need no scroll arithmetic at all, so there is
            nothing left to go stale. */}
        <div
          class="absolute inset-0 z-2147483646 overflow-hidden"
          style={{
            pointerEvents: showCommentCursor ? 'auto' : 'none',
            cursor: showCommentCursor ? 'crosshair' : 'default',
          }}
          onClick={(e) => {
            if (tool !== 'comment') return;
            commentPopover.value = { x: e.clientX, y: e.clientY + (window.scrollY || 0) };
          }}
        >
          {comments.map((c) => (
            <WebCommentPin key={c.id} op={c} scale={1} scrollY={0} />
          ))}
          {commentPopover.value && (
            <CommentPopover
              at={{ x: commentPopover.value.x, y: commentPopover.value.y }}
              anchorAt={{ x: commentPopover.value.x, y: commentPopover.value.y }}
              capture={() => ({ captureViewport: frameViewport(null) })}
              push={pushDeviceOp}
              onClose={() => {
                commentPopover.value = null;
              }}
            />
          )}
        </div>

        {/* Selection highlights */}
        <div class="absolute inset-0 z-2147483645 pointer-events-none overflow-hidden">
          {selections.value.map((op) => (
            <WebSelectionHighlight key={op.id} op={op} scale={1} scrollY={0} />
          ))}
        </div>
        {selectionPopover.value && (
          <WebSelectionPopover
            {...selectionPopover.value}
            onClose={() => {
              selectionPopover.value = null;
            }}
          />
        )}

        {/* Text tool overlay */}
        <div
          class="absolute inset-0 z-2147483646"
          style={{ pointerEvents: showTextCursor ? 'auto' : 'none', cursor: showTextCursor ? 'text' : 'default' }}
          onClick={(e) => {
            if (tool !== 'text') return;
            textInput.value = { x: e.clientX, y: e.clientY + (window.scrollY || 0) };
          }}
        />
        {textInput.value && (
          <TextInputOverlay
            x={textInput.value.x}
            y={textInput.value.y}
            scale={1}
            scrollY={0}
            onCommit={(text) => {
              if (text && textInput.value) {
                const op: TextOp = {
                  id: nanoid(),
                  tool: 'text',
                  text,
                  x: textInput.value.x,
                  y: textInput.value.y,
                  fontSize: Math.max(14, lineWidth.value * 6),
                  color: color.value,
                  lineWidth: lineWidth.value,
                  captureViewport: { width: window.innerWidth, height: window.innerHeight },
                };
                pushDeviceOp(op);
              }
              textInput.value = null;
            }}
          />
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={onDown}
          class="absolute inset-x-0 top-0 z-2147483645"
          style={{
            height: '100%',
            pointerEvents: showCanvas ? 'auto' : 'none',
            cursor: showCanvas ? 'crosshair' : 'default',
          }}
        />

        <InspectorLayer />

        {/* Steps aside while the demo window fills the screen: its own toolbar
            is the one to use there, and two identical bars stacked at the
            bottom edge read as a rendering fault. */}
        <div class="lp-toolbar-in hidden sm:block z-2147483647" data-away={embedInView.value ? 'true' : undefined}>
          <Toolbar />
        </div>

        <Toasts offset="below-bar" />
      </div>
      <SelfCursor />
    </>
  );
}
