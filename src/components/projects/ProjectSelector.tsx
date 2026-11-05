"use client";

import { useEffect, useState } from "react";
import { ACTIVE_STATUSES } from "@/lib/projectTypes";

interface Project {
  id: string;
  name: string;
  projectStatus: string | null;
  type: string;
}

interface ProjectSelectorProps {
  value: string;
  onChange: (projectId: string) => void;
  className?: string;
  includeEmpty?: boolean;
  emptyLabel?: string;
  type?: string; // VERKOOP | AANKOOP | TAXATIE
  activeOnly?: boolean;
}

export default function ProjectSelector({
  value,
  onChange,
  className = "",
  includeEmpty = true,
  emptyLabel = "Geen project",
  type,
  activeOnly = false,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const typeParam = type ? `&type=${type}` : "";
        if (activeOnly) {
          const res = await fetch(
            `/api/projecten?statusGroup=active&limit=200${typeParam}`
          );
          const data = await res.json();
          setProjects(data.projects || []);
        } else {
          const [actiefRes, leadRes] = await Promise.all([
            fetch(`/api/projecten?statusGroup=active&limit=200${typeParam}`),
            fetch(`/api/projecten?statusGroup=lead&limit=200${typeParam}`),
          ]);
          const [actiefData, leadData] = await Promise.all([
            actiefRes.json(),
            leadRes.json(),
          ]);
          setProjects([
            ...(actiefData.projects || []),
            ...(leadData.projects || []),
          ]);
        }
      } catch {
        console.error("Fout bij ophalen projecten");
      }
    }
    fetchProjects();
  }, [type, activeOnly]);

  const actief = projects.filter(
    (p) => p.projectStatus !== null && ACTIVE_STATUSES.includes(p.projectStatus)
  );
  const lead = projects.filter((p) => p.projectStatus === "LEAD");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none ${className}`}
    >
      {includeEmpty && <option value="">{emptyLabel}</option>}
      {actief.length > 0 && (
        <optgroup label="Actief">
          {actief.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </optgroup>
      )}
      {lead.length > 0 && (
        <optgroup label="Lead">
          {lead.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
