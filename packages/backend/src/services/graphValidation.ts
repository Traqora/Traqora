
/**
 * Represents a directed edge in the graph.
 */
export interface GraphEdge<T> {
  from: T;
  to: T;
}

/**
 * Represents a directed graph with nodes of type T.
 */
export interface DirectedGraph<T> {
  nodes: Set<T>;
  edges: GraphEdge<T>[];
}

/**
 * Options for graph validation.
 */
export interface GraphValidationOptions {
  allowCycles?: boolean;
  maxDepth?: number;
  maxNodes?: number;
  requireConnected?: boolean;
}

/**
 * Result of a graph validation.
 */
export interface GraphValidationResult<T = string> {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cycles?: Set<T>[];
}

/**
 * Creates an empty directed graph.
 */
export const createGraph = <T>(): DirectedGraph<T> => ({
  nodes: new Set<T>(),
  edges: [],
});

/**
 * Adds a node to the graph if not already present.
 */
export const addNode = <T>(graph: DirectedGraph<T>, node: T): void => {
  graph.nodes.add(node);
};

/**
 * Adds a directed edge to the graph, adding the nodes if needed.
 */
export const addEdge = <T>(graph: DirectedGraph<T>, edge: GraphEdge<T>): void => {
  graph.nodes.add(edge.from);
  graph.nodes.add(edge.to);
  graph.edges.push(edge);
};

/**
 * Finds all cycles in a directed graph using Tarjan's algorithm.
 */
export const findCycles = <T>(graph: DirectedGraph<T>): Set<T>[] => {
  const indexMap = new Map<T, number>();
  const lowLinkMap = new Map<T, number>();
  const onStack = new Set<T>();
  const stack: T[] = [];
  const cycles: Set<T>[] = [];
  let index = 0;

  const strongConnect = (node: T): void => {
    indexMap.set(node, index);
    lowLinkMap.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);

    const outgoingEdges = graph.edges.filter((e) => e.from === node);
    for (const edge of outgoingEdges) {
      if (!indexMap.has(edge.to)) {
        strongConnect(edge.to);
        lowLinkMap.set(node, Math.min(lowLinkMap.get(node)!, lowLinkMap.get(edge.to)!));
      } else if (onStack.has(edge.to)) {
        lowLinkMap.set(node, Math.min(lowLinkMap.get(node)!, indexMap.get(edge.to)!));
      }
    }

    if (lowLinkMap.get(node) === indexMap.get(node)) {
      const component = new Set<T>();
      let w: T | undefined;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.add(w);
      } while (w !== node);

      if (component.size > 1 || outgoingEdges.some((e) => e.to === node)) {
        cycles.push(component);
      }
    }
  };

  for (const node of graph.nodes) {
    if (!indexMap.has(node)) {
      strongConnect(node);
    }
  }

  return cycles;
};

/**
 * Performs a topological sort on a directed graph.
 * Returns the sorted nodes if the graph is a DAG, or throws an error if cycles exist.
 */
export const topologicalSort = <T>(graph: DirectedGraph<T>): T[] => {
  const inDegree = new Map<T, number>();
  const adjacency = new Map<T, T[]>();

  for (const node of graph.nodes) {
    inDegree.set(node, 0);
    adjacency.set(node, []);
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  const queue: T[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const neighbor of adjacency.get(node) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== graph.nodes.size) {
    const remaining = new Set(graph.nodes);
    for (const node of sorted) {
      remaining.delete(node);
    }
    throw new Error(
      `Graph contains a cycle. Nodes in cycle: ${Array.from(remaining).map(String).join(', ')}`
    );
  }

  return sorted;
};

/**
 * Validates a directed graph according to the given options.
 */
export const validateGraph = <T>(
  graph: DirectedGraph<T>,
  options: GraphValidationOptions = {}
): GraphValidationResult<T> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allowCycles = options.allowCycles ?? false;
  const maxDepth = options.maxDepth;
  const maxNodes = options.maxNodes;
  const requireConnected = options.requireConnected ?? false;

  // Validate nodes
  if (graph.nodes.size === 0) {
    errors.push('Graph must contain at least one node');
  }

  if (maxNodes !== undefined && graph.nodes.size > maxNodes) {
    errors.push(`Graph exceeds maximum node count: ${graph.nodes.size} > ${maxNodes}`);
  }

  // Validate edges reference existing nodes
  for (const edge of graph.edges) {
    if (!graph.nodes.has(edge.from)) {
      errors.push(`Edge references non-existent source node: ${String(edge.from)}`);
    }
    if (!graph.nodes.has(edge.to)) {
      errors.push(`Edge references non-existent target node: ${String(edge.to)}`);
    }
  }

  // Detect duplicate edges
  const edgeSet = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${String(edge.from)}->${String(edge.to)}`;
    if (edgeSet.has(key)) {
      warnings.push(`Duplicate edge detected: ${key}`);
    }
    edgeSet.add(key);
  }

  // Detect self-loops
  for (const edge of graph.edges) {
    if (edge.from === edge.to) {
      warnings.push(`Self-loop detected: ${String(edge.from)} -> ${String(edge.to)}`);
    }
  }

  // Cycle detection
  const cycles = findCycles(graph);
  if (cycles.length > 0 && !allowCycles) {
    errors.push(
      `Graph contains ${cycles.length} cycle(s): ${cycles
        .map((c) => `[${Array.from(c).map(String).join(', ')}]`)
        .join('; ')}`
    );
  }

  // Connectivity check
  if (requireConnected && graph.nodes.size > 0) {
    const visited = new Set<T>();
    const stack: T[] = [Array.from(graph.nodes)[0]];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      const outgoing = graph.edges.filter((e) => e.from === node);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          stack.push(edge.to);
        }
      }
    }
    if (visited.size !== graph.nodes.size) {
      errors.push('Graph is not fully connected (directed connectivity)');
    }
  }

  // Depth validation using longest path heuristic
  if (maxDepth !== undefined && graph.nodes.size > 0) {
    try {
      const sorted = topologicalSort(graph);
      const depth = new Map<T, number>();
      for (const node of sorted) {
        const currentDepth = depth.get(node) || 0;
        const outgoing = graph.edges.filter((e) => e.from === node);
        for (const edge of outgoing) {
          depth.set(edge.to, Math.max(depth.get(edge.to) || 0, currentDepth + 1));
        }
      }
      const maxComputedDepth = Math.max(...depth.values(), 0);
      if (maxComputedDepth > maxDepth) {
        errors.push(
          `Graph depth ${maxComputedDepth} exceeds maximum allowed depth: ${maxDepth}`
        );
      }
    } catch {
      // If there are cycles, we can't compute depth via topological sort
      warnings.push('Cannot validate depth due to cycles in the graph');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cycles: cycles.length > 0 ? cycles : undefined,
  };
};

/**
 * Validates a workflow step dependency graph (sequence of steps with dependencies).
 * This is specifically designed for the executeCompensatedWorkflow pattern.
 */
export interface WorkflowStepNode {
  name: string;
  dependencies: string[];
}

export const validateWorkflowGraph = (
  steps: WorkflowStepNode[]
): GraphValidationResult => {
  const graph = createGraph<string>();

  // Add all steps as nodes
  for (const step of steps) {
    addNode(graph, step.name);
  }

  // Add edges based on dependencies
  for (const step of steps) {
    for (const dep of step.dependencies) {
      if (!graph.nodes.has(dep)) {
        return {
          valid: false,
          errors: [`Step "${step.name}" depends on unknown step "${dep}"`],
          warnings: [],
        };
      }
      addEdge(graph, { from: dep, to: step.name });
    }
  }

  return validateGraph(graph, { allowCycles: false });
};

/**
 * Finds all paths between two nodes in a directed graph.
 */
export const findAllPaths = <T>(graph: DirectedGraph<T>, start: T, end: T): T[][] => {
  const paths: T[][] = [];
  const visited = new Set<T>();

  const dfs = (current: T, path: T[]): void => {
    visited.add(current);
    path.push(current);

    if (current === end) {
      paths.push([...path]);
    } else {
      const outgoing = graph.edges.filter((e) => e.from === current);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          dfs(edge.to, path);
        }
      }
    }

    path.pop();
    visited.delete(current);
  };

  if (graph.nodes.has(start)) {
    dfs(start, []);
  }

  return paths;
};