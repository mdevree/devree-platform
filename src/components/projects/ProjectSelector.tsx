"use client";

import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  status: string;
}

interface ProjectSelectorProps {
  value: string;
  onChange: (projectId: string) => void;
  className?: string;
  includeEmpty?: boolean;
  emptyLabel?: string;
}

export default function ProjectSelector({
  value,
  onChange,
  className = "",
  includeEmpty = true,
  emptyLabel = "Geen project",
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch("/api/projecten?limit=100");
        const data = await response.json();
        setProjects(data.projects || []);
      } catch {
        console.error("Fout bij ophalen projecten");
      }
    }
    fetchProjects();
  }, []);

  const statusLabel: Record<string, string> = {
    lead: "Lead",
    actief: "Actief",
    afgerond: "Afgerond",
    geannuleerd: "Geannuleerd",
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none ${className}`}
    >
      {includeEmpty && <option value="">{emptyLabel}</option>}
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name} ({statusLabel[project.status] || project.status})
        </option>
      ))}
    </select>
  );
}
