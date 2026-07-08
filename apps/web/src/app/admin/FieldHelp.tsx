import type { ReactNode } from 'react';

// A collapsible "ⓘ How to use this" help toggle for admin form fields. Uses the
// native <details> element so it needs no client JS and stays accessible. Place
// it directly beneath the field it explains; collapsed by default so the form
// stays uncluttered.
export function FieldHelp({
  label = 'How to use this',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <details className="field-help">
      <summary>{label}</summary>
      <div className="field-help-body">{children}</div>
    </details>
  );
}
