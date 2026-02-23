'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Trash2, Network, GitBranch, List } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

const NODE_TYPE_COLORS: Record<string, string> = {
  person: '#EC4899',
  organization: '#3B82F6',
  location: '#10B981',
  event: '#F59E0B',
  skill: '#8B5CF6',
  concept: '#06B6D4',
  entity: '#6B7280',
  user: '#F97316',
  memory: '#64748B',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  person: '人物',
  organization: '组织',
  location: '地点',
  event: '事件',
  skill: '技能',
  concept: '概念',
  entity: '实体',
  user: '用户',
  memory: '记忆',
};

interface GraphElements {
  nodes: Array<{ data: any }>;
  edges: Array<{ data: any }>;
}

export default function KnowledgeGraph() {
  const [elements, setElements] = useState<GraphElements>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalEdges, setTotalEdges] = useState(0);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/memories/graph?limit=200`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const elems = data.elements || { nodes: [], edges: [] };
        elems.nodes = elems.nodes.map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            type: (n.data.node_type || n.data.type || 'entity').toLowerCase(),
          },
        }));
        setElements(elems);
        setTotalNodes(data.total_nodes || elems.nodes.length);
        setTotalEdges(data.total_edges || elems.edges.length);
      }
    } catch (error) {
      console.error('加载图谱失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNode = async (nodeData: any) => {
    const nodeType = nodeData.node_type || nodeData.type;
    const nodeId = nodeData.node_id || nodeData.id;
    if (!confirm(`确定删除节点「${nodeData.label}」及其关联边？`)) return;
    try {
      const response = await fetch(
        `${API_BASE}/memories/graph/nodes/${encodeURIComponent(nodeType)}/${encodeURIComponent(nodeId)}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      if (response.ok) {
        setSelectedNode(null);
        loadGraph();
      }
    } catch (error) {
      console.error('删除节点失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (elements.nodes.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <Network className="w-12 h-12 mb-3 opacity-50" />
        <p>暂无知识图谱数据</p>
        <p className="text-sm mt-1">通过对话产生的实体关系会自动出现在这里</p>
      </div>
    );
  }

  // Build node lookup for list view
  const nodeMap = new Map<string, any>();
  elements.nodes.forEach((n) => nodeMap.set(n.data.id, n.data));

  return (
    <div className="p-3 md:p-6">
      {/* Header: stats + view toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totalNodes} 节点 · {totalEdges} 关系
        </span>
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'graph'
                ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            图谱
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            列表
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-3 overflow-x-auto pb-1">
        {Object.entries(NODE_TYPE_COLORS)
          .filter(([type]) => elements.nodes.some((n) => n.data.type === type))
          .map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {NODE_TYPE_LABELS[type] || type}
              </span>
            </div>
          ))}
      </div>

      {viewMode === 'graph' ? (
        <EChartsGraph
          elements={elements}
          onNodeClick={setSelectedNode}
        />
      ) : (
        <RelationshipList
          elements={elements}
          nodeMap={nodeMap}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          onDeleteNode={handleDeleteNode}
        />
      )}

      {/* Selected node detail */}
      {selectedNode && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              节点详情
            </h5>
            <button
              onClick={() => handleDeleteNode(selectedNode)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              删除
            </button>
          </div>
          <div className="space-y-1 text-xs">
            <div>
              <span className="text-gray-500">名称: </span>
              <span className="text-gray-800 dark:text-gray-200">{selectedNode.label}</span>
            </div>
            <div>
              <span className="text-gray-500">类型: </span>
              <span className="text-gray-800 dark:text-gray-200">
                {NODE_TYPE_LABELS[selectedNode.type] || selectedNode.type}
              </span>
            </div>
            {/* Show connected edges */}
            {(() => {
              const connections = elements.edges.filter(
                (e) => e.data.source === selectedNode.id || e.data.target === selectedNode.id
              );
              if (connections.length === 0) return null;
              return (
                <div className="mt-2">
                  <span className="text-gray-500">关系 ({connections.length}):</span>
                  <div className="mt-1 space-y-1">
                    {connections.map((e, i) => {
                      const isSource = e.data.source === selectedNode.id;
                      const otherNode = nodeMap.get(isSource ? e.data.target : e.data.source);
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                          {isSource ? (
                            <>
                              <span className="text-amber-500">→</span>
                              <span className="text-gray-400">{e.data.label || '关联'}</span>
                              <span className="text-amber-500">→</span>
                              <span className="font-medium">{otherNode?.label || '?'}</span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{otherNode?.label || '?'}</span>
                              <span className="text-amber-500">→</span>
                              <span className="text-gray-400">{e.data.label || '关联'}</span>
                              <span className="text-amber-500">→</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== ECharts Graph View ==================== */

function EChartsGraph({
  elements,
  onNodeClick,
}: {
  elements: GraphElements;
  onNodeClick: (nodeData: any) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsInstanceRef = useRef<any>(null);

  const initChart = useCallback(async () => {
    if (!chartRef.current) return;
    const echarts = await import('echarts');

    if (echartsInstanceRef.current) {
      echartsInstanceRef.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    echartsInstanceRef.current = chart;

    const nodes = elements.nodes.map((n) => ({
      id: n.data.id,
      name: n.data.label,
      symbolSize: Math.min(50, 25 + (n.data.count || 1) * 3),
      category: n.data.type,
      itemStyle: {
        color: NODE_TYPE_COLORS[n.data.type] || NODE_TYPE_COLORS.entity,
      },
      _rawData: n.data,
    }));

    const edges = elements.edges.map((e) => ({
      source: e.data.source,
      target: e.data.target,
      label: { show: true, formatter: e.data.label || '', fontSize: 10, color: '#9B8E82' },
      lineStyle: { color: '#D4C8BC', width: 1.5, curveness: 0.2 },
    }));

    const categories = Object.entries(NODE_TYPE_COLORS)
      .filter(([type]) => elements.nodes.some((n) => n.data.type === type))
      .map(([type, color]) => ({
        name: type,
        itemStyle: { color },
      }));

    chart.setOption({
      backgroundColor: '#FFFBF7',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            const type = NODE_TYPE_LABELS[params.data.category] || params.data.category;
            return `<b>${params.name}</b><br/>${type}`;
          }
          return params.data.label?.formatter || '';
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          data: nodes,
          edges: edges,
          categories: categories,
          roam: true,
          draggable: true,
          force: {
            repulsion: 200,
            gravity: 0.1,
            edgeLength: [80, 200],
            friction: 0.6,
          },
          label: {
            show: true,
            position: 'bottom',
            fontSize: 11,
            color: '#3D3229',
            formatter: '{b}',
          },
          emphasis: {
            focus: 'adjacency',
            label: { fontSize: 13, fontWeight: 'bold' },
            lineStyle: { width: 3 },
          },
          edgeLabel: {
            fontSize: 9,
            color: '#9CA3AF',
          },
        },
      ],
    });

    chart.on('click', (params: any) => {
      if (params.dataType === 'node' && params.data._rawData) {
        onNodeClick(params.data._rawData);
      }
    });

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [elements, onNodeClick]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initChart().then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [initChart]);

  return (
    <div
      ref={chartRef}
      className="w-full rounded-lg border border-border"
      style={{ height: '400px' }}
    />
  );
}

/* ==================== Relationship List View ==================== */

function RelationshipList({
  elements,
  nodeMap,
  selectedNode,
  onSelectNode,
  onDeleteNode,
}: {
  elements: GraphElements;
  nodeMap: Map<string, any>;
  selectedNode: any;
  onSelectNode: (d: any) => void;
  onDeleteNode: (d: any) => void;
}) {
  // Group edges by source node
  const groupedByNode = new Map<string, { node: any; relations: Array<{ label: string; target: any; direction: 'out' | 'in' }> }>();

  elements.nodes.forEach((n) => {
    groupedByNode.set(n.data.id, { node: n.data, relations: [] });
  });

  elements.edges.forEach((e) => {
    const sourceGroup = groupedByNode.get(e.data.source);
    const targetGroup = groupedByNode.get(e.data.target);
    const targetNode = nodeMap.get(e.data.target);
    const sourceNode = nodeMap.get(e.data.source);

    if (sourceGroup && targetNode) {
      sourceGroup.relations.push({
        label: e.data.label || '关联',
        target: targetNode,
        direction: 'out',
      });
    }
    if (targetGroup && sourceNode) {
      targetGroup.relations.push({
        label: e.data.label || '关联',
        target: sourceNode,
        direction: 'in',
      });
    }
  });

  // Sort: nodes with more relations first
  const sorted = Array.from(groupedByNode.values()).sort(
    (a, b) => b.relations.length - a.relations.length
  );

  return (
    <div className="space-y-2">
      {sorted.map(({ node, relations }) => {
        const color = NODE_TYPE_COLORS[node.type] || NODE_TYPE_COLORS.entity;
        const isSelected = selectedNode?.id === node.id;

        return (
          <div
            key={node.id}
            className={`rounded-lg border p-3 transition-colors cursor-pointer ${
              isSelected
                ? 'border-blue-500/50 bg-blue-900/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            onClick={() => onSelectNode(node)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{node.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {NODE_TYPE_LABELS[node.type] || node.type}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteNode(node); }}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {relations.length > 0 && (
              <div className="mt-2 pl-5 space-y-0.5">
                {relations.map((rel, i) => {
                  const targetColor = NODE_TYPE_COLORS[rel.target.type] || NODE_TYPE_COLORS.entity;
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {rel.direction === 'out' ? (
                        <>
                          <span className="text-amber-500/70">→</span>
                          <span>{rel.label}</span>
                          <span className="text-amber-500/70">→</span>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: targetColor }} />
                          <span className="text-gray-700 dark:text-gray-300">{rel.target.label}</span>
                        </>
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: targetColor }} />
                          <span className="text-gray-700 dark:text-gray-300">{rel.target.label}</span>
                          <span className="text-amber-500/70">→</span>
                          <span>{rel.label}</span>
                          <span className="text-amber-500/70">→</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
