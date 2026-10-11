document.addEventListener("DOMContentLoaded", () => {
  const codeBlocks = document.querySelectorAll(".code-block");

  const copyIconSvg =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const checkIconSvg =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  codeBlocks.forEach((block) => {
    const pre = block.querySelector("pre");
    if (!pre) return;

    // Determine accessible label
    let label = block.getAttribute("data-label");
    if (!label) {
      const details = block.closest("details");
      const summary = details ? details.querySelector("summary") : null;
      if (summary) {
        label = `${summary.textContent.trim()} install commands`;
      } else {
        label = "install commands";
      }
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.type = "button";
    copyBtn.setAttribute("aria-label", `Copy ${label}`);
    copyBtn.setAttribute("title", `Copy ${label}`);
    copyBtn.innerHTML = `
      <span class="icon-wrap" aria-hidden="true">${copyIconSvg}</span>
      <span class="sr-only" aria-live="polite"></span>
    `;

    copyBtn.addEventListener("click", async () => {
      // Extract code text excluding prompt characters ($)
      const clone = pre.cloneNode(true);
      const promptSpans = clone.querySelectorAll(".prompt-char");
      promptSpans.forEach((span) => span.remove());

      const raw = clone.textContent || "";
      const lines = raw.split(/\r?\n/);
      const cleanLines = lines
        .map((line) => line.replace(/^\$\s*/, "").trimEnd())
        .filter((line, index, arr) => {
          if (index === arr.length - 1 && line.trim() === "") return false;
          return true;
        });

      const textToCopy = cleanLines.join("\n");

      const success = await copyText(textToCopy);
      const iconWrap = copyBtn.querySelector(".icon-wrap");
      const srAnnounce = copyBtn.querySelector(".sr-only");

      if (success) {
        if (iconWrap) iconWrap.innerHTML = checkIconSvg;
        if (srAnnounce) srAnnounce.textContent = "Copied";
        copyBtn.setAttribute("title", "Copied");

        setTimeout(() => {
          if (iconWrap) iconWrap.innerHTML = copyIconSvg;
          if (srAnnounce) srAnnounce.textContent = "";
          copyBtn.setAttribute("title", `Copy ${label}`);
        }, 2000);
      }
    });

    block.appendChild(copyBtn);
  });
});

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // Fallback for non-secure contexts (http://, file://, or permissions issues)
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}
