import { describe, expect, it } from 'vitest';
import { parseMermaidSource } from '../parser';

describe('parseGitGraph branch inheritance', () => {
  it('connects checkout edge from source branch commit to new branch first commit', () => {
    const source = `gitGraph LR:
  commit id: "A"
  branch develop
  branch feature
  commit id: "B"`;

    const model = parseMermaidSource(source);
    const commitNodes = model.nodes.filter(
      (node) => node.data.diagramType === 'gitGraph' && node.data.variant === 'commit',
    );
    const commitsByMetadataId = new Map<string, typeof commitNodes[number]>();
    commitNodes.forEach((node) => {
      const idMetadata = node.data.metadata?.id;
      if (typeof idMetadata === 'string' && idMetadata.trim().length > 0) {
        commitsByMetadataId.set(idMetadata, node);
      }
    });

    const baseCommit = commitsByMetadataId.get('A');
    const featureCommit = commitsByMetadataId.get('B');
    expect(baseCommit, 'base commit A should exist').toBeTruthy();
    expect(featureCommit, 'feature commit B should exist').toBeTruthy();

    const checkoutEdges = model.edges.filter((edge) => edge.data.variant === 'gitCheckout');
    expect(checkoutEdges.length, 'at least one checkout edge should be generated').toBeGreaterThan(0);
    const firstCheckout = checkoutEdges[0];

    expect(firstCheckout.source).toBe(baseCommit?.id);
    expect(firstCheckout.target).toBe(featureCommit?.id);
  });
});
