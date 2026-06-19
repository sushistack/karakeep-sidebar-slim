"use strict";

function processCard(card) {
  if (card.classList.contains("flex-col")) return;
  if (card.dataset.kkDone) return;
  card.dataset.kkDone = "1";

  const textCol = Array.from(card.children).find(
    (el) =>
      el.classList.contains("flex-1") && el.classList.contains("flex-col"),
  );
  if (!textCol) return;

  const bottomRow = textCol.lastElementChild;
  if (!bottomRow) return;

  const bottomLeft = bottomRow.firstElementChild;
  const actionBar = bottomRow.lastElementChild;

  if (actionBar && actionBar !== bottomLeft) {
    actionBar.dataset.kkActionBar = "1";
  }

  const previewUrl = actionBar
    ?.querySelector('a[href*="/dashboard/preview/"]')
    ?.getAttribute("href");

  if (!bottomLeft) return;

  // Remove date link and preceding "•"
  const dateLink = Array.from(bottomLeft.querySelectorAll("a")).find(
    (a) =>
      !a.getAttribute("target") &&
      a.getAttribute("href")?.includes("/dashboard/preview/"),
  );
  if (dateLink) {
    const prev = dateLink.previousSibling;
    if (prev?.nodeType === 3) prev.remove();
    dateLink.remove();
  }

  // Always hide tagsWrap to remove gap
  const innerDiv = textCol.firstElementChild;
  const tagsWrap = innerDiv?.querySelector(".flex-wrap");
  if (tagsWrap) tagsWrap.style.display = "none";

  const tagEls = tagsWrap ? Array.from(tagsWrap.children) : [];

  if (tagEls.length > 0) {
    const MAX = 2;
    const inlineTags = document.createElement("div");
    inlineTags.className = "kk-tags";
    tagEls
      .slice(0, MAX)
      .forEach((t) => inlineTags.appendChild(t.cloneNode(true)));
    bottomLeft.appendChild(inlineTags);

    if (tagEls.length > MAX) {
      let open = false;
      const btn = document.createElement("button");
      btn.className = "kk-more";
      btn.textContent = `+${tagEls.length - MAX}`;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        open = !open;
        if (open) {
          const allTags = document.createElement("div");
          allTags.className = "kk-all-tags";
          tagEls.forEach((t) => allTags.appendChild(t.cloneNode(true)));
          textCol.insertBefore(allTags, bottomRow);
          textCol.style.overflow = "visible";
          inlineTags.style.display = "none";
          btn.textContent = "−";
        } else {
          textCol.querySelector(".kk-all-tags")?.remove();
          textCol.style.overflow = "";
          inlineTags.style.display = "";
          btn.textContent = `+${tagEls.length - MAX}`;
        }
      });

      bottomLeft.appendChild(btn);
    }
  } else if (previewUrl) {
    // No tags — link to preview page (Details tab must be opened manually)
    const addTag = document.createElement("a");
    addTag.className = "kk-add-tag";
    addTag.href = previewUrl;
    addTag.textContent = "+ tag";
    addTag.addEventListener("click", (e) => e.stopPropagation());
    bottomLeft.appendChild(addTag);
  }
}

let timer;
function run() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    document.querySelectorAll("[data-bookmark-index]").forEach(processCard);
  }, 80);
}

run();
new MutationObserver(run).observe(document.body, {
  childList: true,
  subtree: true,
});
