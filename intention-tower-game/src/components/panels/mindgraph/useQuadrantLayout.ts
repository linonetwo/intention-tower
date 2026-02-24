import { useEffect, useMemo, useState } from 'react';

type QuadrantConfig = {
  conceptSchemas?: string[];
};

type LayerConfig = {
  quadrants?: QuadrantConfig[];
};

type LayoutConfig = {
  layers?: LayerConfig[];
};

export function useQuadrantLayout() {
  const [layout, setLayout] = useState<LayoutConfig | null>(null);

  useEffect(() => {
    let disposed = false;
    fetch('/assets/quadrants/default-layout.jsonld')
      .then(async (response) => {
        if (!response.ok) throw new Error(`load layout failed: ${response.status}`);
        return response.json() as Promise<LayoutConfig>;
      })
      .then((json) => {
        if (!disposed) setLayout(json);
      })
      .catch(() => {
        if (!disposed) setLayout(null);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const schemaToCell = useMemo(() => {
    const mapping = new Map<string, number>();
    if (!layout?.layers) return mapping;

    layout.layers.forEach((layer, rowIndex) => {
      (layer.quadrants ?? []).forEach((quadrant, columnIndex) => {
        const cellIndex = rowIndex * 3 + columnIndex;
        (quadrant.conceptSchemas ?? []).forEach((schema) => {
          mapping.set(schema, cellIndex);
        });
      });
    });

    return mapping;
  }, [layout]);

  return { layoutLoaded: !!layout, schemaToCell };
}
