document.addEventListener("DOMContentLoaded", () => {
  const codeBlocks = document.querySelectorAll(".code-block");

  codeBlocks.forEach((block) => {
    const pre = block.querySelector("pre");
    if (!pre) return;

    // Use existing toolbar or create one before pre
    let toolbar = block.querySelector(".code-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "code-toolbar";
      block.insertBefore(toolbar, pre);
    }

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
    copyBtn.textContent = "Copy";
    copyBtn.setAttribute("aria-label", `Copy ${label}`);

    copyBtn.addEventListener("click", async () => {
      // Extract code text excluding prompt characters ($)
      const clone = pre.cloneNode(true);
      const promptSpans = clone.querySelectorAll(".prompt-char");
      promptSpans.forEach((span) => span.remove());

      const raw = clone.innerText || clone.textContent || "";
      const lines = raw.split(/\r?\n/);
      const cleanLines = lines
        .map((line) => line.replace(/^\$\s*/, "").trimEnd())
        .filter((line, index, arr) => {
          if (index === arr.length - 1 && line === "") return false;
          return true;
        });

      const textToCopy = cleanLines.join("\n");

      const success = await copyText(textToCopy);
      if (success) {
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      } else {
        copyBtn.textContent = "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      }
    });

    toolbar.appendChild(copyBtn);
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
