/// <reference types="jest" />

import {
  createGraph,
  addNode,
  addEdge,
  findCycles,
  topologicalSort,
  validateGraph,
  validateWorkflowGraph,
  findAllPaths,
} from '../../src/services/graphValidation';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('graphValidation - createGraph', () => {
  it('creates an empty graph', () => {
    const graph = createGraph<string>();
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges).toEqual([]);
  });

  it('creates a graph with generic type', () => {
    const graph = createGraph<number>();
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges).toEqual([]);
  });
});

describe('graphValidation - addNode', () => {
  it('adds a node to the graph', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    expect(graph.nodes.has('A')).toBe(true);
    expect(graph.nodes.size).toBe(1);
  });

  it('does not duplicate nodes', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    addNode(graph, 'A');
    expect(graph.nodes.size).toBe(1);
  });

  it('adds multiple nodes', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    addNode(graph, 'B');
    addNode(graph, 'C');
    expect(graph.nodes.size).toBe(3);
  });
});

describe('graphValidation - addEdge', () => {
  it('adds an edge and its nodes to the graph', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    expect(graph.nodes.has('A')).toBe(true);
    expect(graph.nodes.has('B')).toBe(true);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: 'A', to: 'B' });
  });

  it('adds multiple edges', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    expect(graph.nodes.size).toBe(3);
    expect(graph.edges).toHaveLength(2);
  });

  it('allows duplicate edges', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'A', to: 'B' });
    expect(graph.edges).toHaveLength(2);
  });
});

describe('graphValidation - findCycles', () => {
  it('returns empty array for a DAG', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    addEdge(graph, { from: 'A', to: 'C' });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(0);
  });

  it('detects a simple cycle', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].has('A')).toBe(true);
    expect(cycles[0].has('B')).toBe(true);
  });

  it('detects a self-loop', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'A' });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].has('A')).toBe(true);
  });

  it('detects a longer cycle', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    addEdge(graph, { from: 'C', to: 'D' });
    addEdge(graph, { from: 'D', to: 'A' });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].size).toBe(4);
  });

  it('detects multiple cycles', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    addEdge(graph, { from: 'C', to: 'D' });
    addEdge(graph, { from: 'D', to: 'C' });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(2);
  });

  it('handles empty graph', () => {
    const graph = createGraph<string>();
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(0);
  });

  it('handles graph with only nodes and no edges', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    addNode(graph, 'B');
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(0);
  });
});

describe('graphValidation - topologicalSort', () => {
  it('sorts a simple DAG', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    const sorted = topologicalSort(graph);
    expect(sorted).toEqual(['A', 'B', 'C']);
  });

  it('sorts a DAG with multiple roots', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'C' });
    addEdge(graph, { from: 'B', to: 'C' });
    const sorted = topologicalSort(graph);
    expect(sorted.indexOf('C')).toBeGreaterThan(sorted.indexOf('A'));
    expect(sorted.indexOf('C')).toBeGreaterThan(sorted.indexOf('B'));
  });

  it('throws on graph with cycle', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    expect(() => topologicalSort(graph)).toThrow('Graph contains a cycle');
  });

  it('handles single node graph', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    const sorted = topologicalSort(graph);
    expect(sorted).toEqual(['A']);
  });

  it('handles disconnected DAG', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'C', to: 'D' });
    const sorted = topologicalSort(graph);
    expect(sorted).toHaveLength(4);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
  });
});

describe('graphValidation - validateGraph', () => {
  it('validates a valid DAG', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty graph', () => {
    const graph = createGraph<string>();
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Graph must contain at least one node');
  });

  it('rejects graph with cycles by default', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('allows cycles when allowCycles is true', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    const result = validateGraph(graph, { allowCycles: true });
    expect(result.valid).toBe(true);
  });

  it('rejects graph exceeding maxNodes', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    addNode(graph, 'B');
    addNode(graph, 'C');
    const result = validateGraph(graph, { maxNodes: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maximum node count'))).toBe(true);
  });

  it('detects edges referencing non-existent nodes', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    graph.edges.push({ from: 'A', to: 'Z' });
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-existent target node'))).toBe(true);
  });

  it('detects edges from non-existent source nodes', () => {
    const graph = createGraph<string>();
    addNode(graph, 'B');
    graph.edges.push({ from: 'Z', to: 'B' });
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-existent source node'))).toBe(true);
  });

  it('warns on duplicate edges', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'A', to: 'B' });
    const result = validateGraph(graph);
    expect(result.warnings.some((w) => w.includes('Duplicate edge'))).toBe(true);
  });

  it('warns on self-loops', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'A' });
    const result = validateGraph(graph, { allowCycles: true });
    expect(result.warnings.some((w) => w.includes('Self-loop'))).toBe(true);
  });

  it('validates connectivity when requireConnected is true', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addNode(graph, 'C');
    const result = validateGraph(graph, { requireConnected: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not fully connected'))).toBe(true);
  });

  it('passes connectivity check for connected graph', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    const result = validateGraph(graph, { requireConnected: true });
    expect(result.valid).toBe(true);
  });

  it('validates maxDepth for a DAG', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    addEdge(graph, { from: 'C', to: 'D' });
    const result = validateGraph(graph, { maxDepth: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('depth'))).toBe(true);
  });

  it('passes depth validation when within limit', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    const result = validateGraph(graph, { maxDepth: 3 });
    expect(result.valid).toBe(true);
  });

  it('returns cycles in result when cycles exist', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    const result = validateGraph(graph);
    expect(result.cycles).toBeDefined();
    expect(result.cycles).toHaveLength(1);
  });

  it('does not return cycles when graph is acyclic', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    const result = validateGraph(graph);
    expect(result.cycles).toBeUndefined();
  });
});

describe('graphValidation - validateWorkflowGraph', () => {
  it('validates a valid workflow with dependencies', () => {
    const steps = [
      { name: 'validate_input', dependencies: [] },
      { name: 'process_payment', dependencies: ['validate_input'] },
      { name: 'send_confirmation', dependencies: ['process_payment'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(true);
  });

  it('rejects workflow with circular dependencies', () => {
    const steps = [
      { name: 'A', dependencies: ['B'] },
      { name: 'B', dependencies: ['C'] },
      { name: 'C', dependencies: ['A'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('rejects workflow with unknown dependency', () => {
    const steps = [
      { name: 'A', dependencies: ['unknown_step'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown step'))).toBe(true);
  });

  it('validates workflow with no dependencies', () => {
    const steps = [
      { name: 'A', dependencies: [] },
      { name: 'B', dependencies: [] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(true);
  });

  it('validates workflow with multiple dependencies', () => {
    const steps = [
      { name: 'A', dependencies: [] },
      { name: 'B', dependencies: [] },
      { name: 'C', dependencies: ['A', 'B'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(true);
  });

  it('rejects empty workflow', () => {
    const result = validateWorkflowGraph([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least one node'))).toBe(true);
  });
});

describe('graphValidation - findAllPaths', () => {
  it('finds a direct path', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    const paths = findAllPaths(graph, 'A', 'B');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toEqual(['A', 'B']);
  });

  it('finds multiple paths', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'A', to: 'C' });
    addEdge(graph, { from: 'B', to: 'D' });
    addEdge(graph, { from: 'C', to: 'D' });
    const paths = findAllPaths(graph, 'A', 'D');
    expect(paths).toHaveLength(2);
  });

  it('returns empty array when no path exists', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'C', to: 'D' });
    const paths = findAllPaths(graph, 'A', 'D');
    expect(paths).toHaveLength(0);
  });

  it('returns empty array when start node does not exist', () => {
    const graph = createGraph<string>();
    addNode(graph, 'A');
    const paths = findAllPaths(graph, 'Z', 'A');
    expect(paths).toHaveLength(0);
  });

  it('finds path through intermediate nodes', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'C' });
    addEdge(graph, { from: 'C', to: 'D' });
    const paths = findAllPaths(graph, 'A', 'D');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toEqual(['A', 'B', 'C', 'D']);
  });

  it('handles graph with cycles without infinite loop', () => {
    const graph = createGraph<string>();
    addEdge(graph, { from: 'A', to: 'B' });
    addEdge(graph, { from: 'B', to: 'A' });
    addEdge(graph, { from: 'A', to: 'C' });
    const paths = findAllPaths(graph, 'A', 'C');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toEqual(['A', 'C']);
  });
});

describe('graphValidation - integration with booking workflow', () => {
  it('validates a booking workflow graph', () => {
    // Simulating the booking orchestration workflow
    const steps = [
      { name: 'find_flight', dependencies: [] },
      { name: 'reserve_seat', dependencies: ['find_flight'] },
      { name: 'create_passenger', dependencies: ['find_flight'] },
      { name: 'submit_soroban_tx', dependencies: ['reserve_seat', 'create_passenger'] },
      { name: 'save_booking', dependencies: ['submit_soroban_tx'] },
      { name: 'poll_status', dependencies: ['save_booking'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(true);
  });

  it('detects circular dependency in booking workflow', () => {
    const steps = [
      { name: 'find_flight', dependencies: ['poll_status'] },
      { name: 'reserve_seat', dependencies: ['find_flight'] },
      { name: 'poll_status', dependencies: ['reserve_seat'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(false);
  });

  it('validates a refund workflow graph', () => {
    const steps = [
      { name: 'validate_refund_request', dependencies: [] },
      { name: 'check_eligibility', dependencies: ['validate_refund_request'] },
      { name: 'process_refund', dependencies: ['check_eligibility'] },
      { name: 'notify_user', dependencies: ['process_refund'] },
    ];
    const result = validateWorkflowGraph(steps);
    expect(result.valid).toBe(true);
  });
});