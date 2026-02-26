'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function VersionBadge() {
  const [versions, setVersions] = useState<{ app: string; neuromem: string } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/version`)
      .then((r) => r.json())
      .then(setVersions)
      .catch(() => {});
  }, []);

  if (!versions) return null;

  return (
    <div className="text-[11px] text-muted-foreground/50 leading-relaxed">
      <div>Me2 v{versions.app}</div>
      <div>neuromem v{versions.neuromem}</div>
    </div>
  );
}
