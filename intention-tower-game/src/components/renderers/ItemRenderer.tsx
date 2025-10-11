/**
 * 物品渲染器
 */
import { Container, Sprite, Text } from '@pixi/react';
import React from 'react';
import type { Item } from '../../types/game';

interface ItemRendererProps {
  item: Item;
  cameraOffset: { x: number; y: number };
}

export const ItemRenderer: React.FC<ItemRendererProps> = ({ item, cameraOffset }) => {
  if (!item.position) return null;

  const screenX = item.position.x - cameraOffset.x;
  const screenY = item.position.y - cameraOffset.y;

  if (item.sprite) {
    return (
      <Container x={screenX} y={screenY}>
        <Sprite image={item.sprite} anchor={0.5} />
      </Container>
    );
  }

  return (
    <Container x={screenX} y={screenY}>
      <Text
        text={item.fallbackChar || '?'}
        anchor={0.5}
        style={{
          fontSize: 20,
          fill: 0xffaa00,
          fontFamily: 'monospace',
        }}
      />
    </Container>
  );
};
