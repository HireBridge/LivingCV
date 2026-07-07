import React from 'react';

export const dynamic = 'force-dynamic';

export default function ThemeHelpPage() {
  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Theme Customization Guide</h1>
      <p style={{ marginBottom: 24, fontSize: '1.1rem', color: 'var(--ink-soft)' }}>
        Learn how to fully customize your portfolio using the advanced JSON editor.
      </p>

      <section className="admin-card">
        <h3>How to Use JSON Themes</h3>
        <p style={{ marginBottom: 15 }}>
          Your portfolio theme is entirely data-driven. By supplying a JSON object, you can override any token defined in your active template. The JSON object expects standard CSS color values like HEX, RGB, or HSL strings.
        </p>
        <p style={{ marginBottom: 15 }}>
          <strong>Example:</strong>
        </p>
        <pre style={{ marginBottom: 20 }}>
{`{
  "paper": "#121212",
  "paperDeep": "#1a1a1a",
  "ink": "#f0f0f0",
  "inkSoft": "#888888",
  "signal": "#4facfe",
  "rule": "#333333"
}`}
        </pre>

        <h4 style={{ marginBottom: 10, marginTop: 20 }}>Available Tokens (Classic Template)</h4>
        <ul style={{ paddingLeft: 20, marginBottom: 20, color: 'var(--ink-soft)' }}>
          <li style={{ marginBottom: 8 }}><code>paper</code>: The main background color</li>
          <li style={{ marginBottom: 8 }}><code>paperDeep</code>: The secondary background color (used for code blocks, sidebars, headers)</li>
          <li style={{ marginBottom: 8 }}><code>ink</code>: Primary text color</li>
          <li style={{ marginBottom: 8 }}><code>inkSoft</code>: Secondary text color for kickers and small text</li>
          <li style={{ marginBottom: 8 }}><code>rule</code>: Color for borders and dividers</li>
          <li style={{ marginBottom: 8 }}><code>signal</code>: Accent color for primary buttons and active states</li>
          <li style={{ marginBottom: 8 }}><code>signalSoft</code>: Hover state for primary buttons</li>
          <li style={{ marginBottom: 8 }}><code>rust</code>: Destructive color (errors, deletions)</li>
          <li style={{ marginBottom: 8 }}><code>max</code>: The max-width of the main content wrapper (e.g. "800px")</li>
          <li style={{ marginBottom: 8 }}><code>fontBody</code>: Body font family</li>
          <li style={{ marginBottom: 8 }}><code>fontHeading</code>: Heading font family</li>
          <li style={{ marginBottom: 8 }}><code>fontMono</code>: Monospace font family</li>
          <li style={{ marginBottom: 8 }}><code>fontSizeBase</code>: Base font size (e.g. "18px")</li>
        </ul>

        <h4 style={{ marginBottom: 10, marginTop: 20 }}>Using CSS Variables</h4>
        <p style={{ marginBottom: 15 }}>
          You can inject arbitrary CSS properties by defining your own custom CSS values.
          For instance, if you want a gradient background, you can use:
        </p>
        <pre style={{ marginBottom: 20 }}>
{`{
  "paper": "linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)",
  "signal": "rgba(79, 172, 254, 1)"
}`}
        </pre>

        <h4 style={{ marginBottom: 10, marginTop: 20 }}>Automating via AI & MCP</h4>
        <p style={{ marginBottom: 15 }}>
          Because the theme is stored simply as JSON under the <code>theme</code> section key in the <code>site_content</code> table, it can be entirely driven by your AI client (like Claude Desktop) using the Master MCP connection.
        </p>
        <p>
          Simply tell your AI: <em>"Change my portfolio theme to a dark hacker aesthetic"</em> or <em>"Update my portfolio theme with soft pastel colors"</em>. The MCP agent will invoke the <code>updateSiteContent</code> tool with <code>section="theme"</code> and valid JSON mapping the keys automatically.
        </p>
      </section>
    </div>
  );
}
