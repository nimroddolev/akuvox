/** Lightweight panel localization with English fallback. */
import english from "../translations/en.js?v=20261003-i18n-statuses";
import german from "../translations/de.js?v=20261003-i18n-statuses";
import hebrew from "../translations/he.js?v=20261004-sip-pdf-hebrew";

const catalogs = { en: english, de: german, he: hebrew };
const translatedAttributes = ["aria-label", "title", "placeholder", "alt"];

export const languageFor = (host) => String(host?._hass?.locale?.language || "en")
  .toLowerCase().split("-")[0];

export const isRtlLanguage = (host) => languageFor(host) === "he";

export const t = (host, source, values = {}) => {
  const catalog = catalogs[languageFor(host)] || catalogs.en;
  let result = catalog[source] || source;
  Object.entries(values).forEach(([key, value]) => {
    result = result.replaceAll(`{${key}}`, String(value));
  });
  return result;
};

const translateValue = (host, value) => {
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const source = value.trim();
  return source ? `${leading}${t(host, source)}${trailing}` : value;
};

/** Translate static text and accessible attributes after a panel fragment is rendered. */
export const localizeElement = (host, root) => {
  if (!root || languageFor(host) === "en") return;
  const documentRef = root.ownerDocument || root;
  const walker = documentRef.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => { node.nodeValue = translateValue(host, node.nodeValue); });
  root.querySelectorAll?.("*").forEach((element) => {
    translatedAttributes.forEach((attribute) => {
      if (element.hasAttribute(attribute)) {
        element.setAttribute(attribute, translateValue(host, element.getAttribute(attribute)));
      }
    });
  });
};
