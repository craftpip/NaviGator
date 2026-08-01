const MAX_LINK_MEMORY_ENTRIES = 2000;

const linkMemoryByRef = new Map();
const linkMemoryByUrl = new Map();
let nextLinkRef = 1;

export function getRememberedLinkRecord(ref) {
  const remembered = linkMemoryByRef.get(ref);
  if (!remembered) return null;
  if (typeof remembered === "string") {
    return { url: remembered };
  }
  const url = String(remembered?.url || "").trim();
  if (!url) return null;
  return { url };
}

function pruneLinkMemory() {
  while (linkMemoryByRef.size > MAX_LINK_MEMORY_ENTRIES) {
    const oldestRef = linkMemoryByRef.keys().next().value;
    if (oldestRef === undefined) break;
    const rememberedUrl = getRememberedLinkRecord(oldestRef)?.url;
    linkMemoryByRef.delete(oldestRef);
    if (rememberedUrl) {
      linkMemoryByUrl.delete(rememberedUrl);
    }
  }
}

export function rememberLink(url) {
  const normalized = String(url || "").trim();
  if (!normalized) return null;

  pruneLinkMemory();

  const existingRef = linkMemoryByUrl.get(normalized);
  if (existingRef) return existingRef;

  const ref = nextLinkRef;
  nextLinkRef += 1;
  linkMemoryByUrl.set(normalized, ref);
  linkMemoryByRef.set(ref, normalized);
  pruneLinkMemory();
  return ref;
}

export function resolveRefIdToUrl(ref) {
  const remembered = getRememberedLinkRecord(ref);
  if (!remembered?.url) {
    throw new Error(`No link found in memory for ref ${ref}`);
  }
  return remembered.url;
}

export function getLinkRefByUrl(url) {
  return linkMemoryByUrl.get(url) ?? null;
}

export function getUrlForRefId(ref) {
  return getRememberedLinkRecord(ref)?.url ?? null;
}
