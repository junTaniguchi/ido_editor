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

  it('sets branch metadata on commits according to the active branch', () => {
    const source = `gitGraph LR:
  commit id: "A"
  commit id: "B"
  branch "feature/login"
  checkout "feature/login"
  commit id: "C"
  checkout main
  commit id: "D"`;

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

    const featureBranch = model.nodes.find(
      (node) =>
        node.data.diagramType === 'gitGraph'
        && node.data.variant === 'branch'
        && node.data.label?.trim() === 'feature/login',
    );

    expect(featureBranch, 'feature/login branch should exist').toBeTruthy();
    const featureBranchId = featureBranch?.id ?? '';

    const commitA = commitsByMetadataId.get('A');
    const commitB = commitsByMetadataId.get('B');
    const commitC = commitsByMetadataId.get('C');
    const commitD = commitsByMetadataId.get('D');

    expect(commitA?.data.metadata?.branchId).toBe('main');
    expect(commitB?.data.metadata?.branchId).toBe('main');
    expect(commitC?.data.metadata?.branchId).toBe(featureBranchId);
    expect(commitD?.data.metadata?.branchId).toBe('main');
  });

  it('links branch creation and checkout command nodes with dedicated edges', () => {
    const source = `gitGraph LR:
  commit id: "A"
  branch feature
  checkout feature`;

    const model = parseMermaidSource(source);
    const branchNode = model.nodes.find(
      (node) =>
        node.data.diagramType === 'gitGraph'
        && node.data.variant === 'branch'
        && node.data.label?.trim() === 'feature',
    );
    const checkoutNode = model.nodes.find(
      (node) =>
        node.data.diagramType === 'gitGraph'
        && node.data.variant === 'checkout'
        && node.data.label?.trim() === 'feature',
    );
    const branchCreateEdge = model.edges.find(
      (edge) =>
        edge.data.diagramType === 'gitGraph'
        && edge.data.variant === 'gitBranchCreate'
        && edge.target === branchNode?.id,
    );
    const checkoutEdge = model.edges.find(
      (edge) =>
        edge.data.diagramType === 'gitGraph'
        && edge.data.variant === 'gitCheckout'
        && edge.source === branchNode?.id
        && edge.target === checkoutNode?.id,
    );

    expect(branchNode, 'branch node should exist').toBeTruthy();
    expect(checkoutNode, 'checkout node should exist').toBeTruthy();
    expect(branchCreateEdge, 'branch node should be connected from the previous commit').toBeTruthy();
    expect(checkoutEdge, 'branch node should connect to the checkout command').toBeTruthy();
  });

  it('connects merge commands to the latest commits of participating branches', () => {
    const source = `gitGraph LR:
  commit id: "A"
  branch feature
  checkout feature
  commit id: "B"
  checkout main
  merge feature`;

    const model = parseMermaidSource(source);
    const mergeNode = model.nodes.find(
      (node) => node.data.diagramType === 'gitGraph' && node.data.variant === 'merge',
    );
    const mergeEdges = model.edges.filter(
      (edge) => edge.data.diagramType === 'gitGraph' && edge.data.variant === 'gitMerge',
    );
    const commitNodes = model.nodes.filter(
      (node) => node.data.diagramType === 'gitGraph' && node.data.variant === 'commit',
    );
    const commitById = new Map<string, typeof commitNodes[number]>();
    commitNodes.forEach((node) => {
      const idMetadata = node.data.metadata?.id;
      if (typeof idMetadata === 'string') {
        commitById.set(idMetadata, node);
      }
    });
    const featureCommit = commitById.get('B');
    expect(mergeNode, 'merge node should exist').toBeTruthy();
    expect(featureCommit, 'feature branch commit should exist').toBeTruthy();
    const edgeFromFeature = mergeEdges.find((edge) => edge.source === featureCommit?.id);

    expect(edgeFromFeature, 'merge node should receive an edge from the feature branch commit').toBeTruthy();
  });
});
