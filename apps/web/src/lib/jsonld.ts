// Serialize a value for safe embedding inside a <script type="application/ld+json">
// tag. JSON.stringify alone does NOT escape `<`, `>`, or `&`, so admin-authored
// content containing `</script>` (or `<!--`) could break out of the script
// element → stored XSS. We escape those characters to their \uXXXX forms, which
// are still valid JSON and parse identically, but can never terminate the tag.
export function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
