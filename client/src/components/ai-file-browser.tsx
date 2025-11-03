
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface AIFileBrowserProps {
  onFileSelect: (path: string) => void;
  selectedFile?: string;
}

export function AIFileBrowser({ onFileSelect, selectedFile }: AIFileBrowserProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/']));

  useEffect(() => {
    loadProjectTree();
  }, []);

  const loadProjectTree = async () => {
    try {
      const response = await fetch("/api/ai/project-tree");
      const data = await response.json();
      setTree(data);
    } catch (error) {
      console.error('Failed to load project tree:', error);
    }
  };

  const toggleExpand = (path: string) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expanded.has(node.path);
    const isSelected = selectedFile === node.path;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 py-1 px-2 hover:bg-accent rounded cursor-pointer ${
            isSelected ? 'bg-primary/20' : ''
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              toggleExpand(node.path);
            } else {
              onFileSelect(node.path);
            }
          }}
        >
          {node.type === 'directory' ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-blue-500" />
              ) : (
                <Folder className="h-4 w-4 text-blue-500" />
              )}
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 text-gray-500 ml-3" />
            </>
          )}
          <span className="text-sm truncate">{node.name}</span>
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Project Files
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-180px)]">
          {tree ? renderNode(tree) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading files...
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
