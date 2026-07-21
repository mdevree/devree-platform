export type ContactWarning = {
  code: string;
  field: string | null;
  message: string;
};

export type DebiteurenControleProject = {
  id: string;
  name: string;
  type: string;
  status: string;
  projectStatus: string | null;
  woningAdres: string | null;
  woningPostcode: string | null;
  woningPlaats: string | null;
  mauticContactId: number | null;
  updatedAt: Date;
  contacts: Array<{ mauticContactId: number; role: string }>;
  debiteurenLink: {
    id: string;
    debiteurenKlantId: number;
    klantNaam: string | null;
    klantEmail: string | null;
    klantAdres: string | null;
    mauticContactId: number | null;
    contactWarnings: unknown;
    normalizationCheckedAt: Date | null;
    contactWarningsReviewedAt: Date | null;
    contactWarningsReviewedBy: string | null;
    contactWarningsReviewNote: string | null;
    linkedAt: Date;
    lastCheckedAt: Date | null;
  } | null;
  debiteurenInvoices: Array<{
    id: string;
    debiteurenFactuurId: number;
    factuurnummer: number | null;
    invoiceType: string;
    amountInclCents: number;
    createdAt: Date;
  }>;
};

const CLOSED_PROJECT_STATUSES = new Set(["AFGEROND", "GEANNULEERD", "GEPASSEERD"]);

export function parseContactWarnings(value: unknown): ContactWarning[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const warning = item as Record<string, unknown>;
    const message = typeof warning.message === "string" ? warning.message.trim() : "";
    if (!message) return [];

    return [{
      code: typeof warning.code === "string" ? warning.code : "unknown",
      field: typeof warning.field === "string" ? warning.field : null,
      message,
    }];
  });
}

export function projectMauticContactIds(project: Pick<DebiteurenControleProject, "mauticContactId" | "contacts">) {
  return [...new Set([
    ...(project.mauticContactId ? [project.mauticContactId] : []),
    ...project.contacts.map((contact) => contact.mauticContactId),
  ])];
}

export function isActiveDebiteurenControleProject(project: Pick<DebiteurenControleProject, "status" | "projectStatus">) {
  if (project.projectStatus && CLOSED_PROJECT_STATUSES.has(project.projectStatus)) return false;
  return !/(afgerond|geannuleerd|gepasseerd)/i.test(project.status || "");
}

function projectAddress(project: Pick<DebiteurenControleProject, "woningAdres" | "woningPostcode" | "woningPlaats">) {
  return [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ") || null;
}

function projectBase(project: DebiteurenControleProject) {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    status: project.projectStatus || project.status,
    address: projectAddress(project),
    mauticContactIds: projectMauticContactIds(project),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function buildDebiteurenControle(projects: DebiteurenControleProject[]) {
  const activeProjects = projects.filter(isActiveDebiteurenControleProject);
  const linkedProjects = activeProjects.filter((project) => project.debiteurenLink);
  const unlinkedWithMautic = activeProjects
    .filter((project) => !project.debiteurenLink && projectMauticContactIds(project).length > 0)
    .map(projectBase)
    .slice(0, 50);

  const linksWithWarnings = linkedProjects
    .flatMap((project) => {
      const warnings = parseContactWarnings(project.debiteurenLink?.contactWarnings);
      if (!project.debiteurenLink || warnings.length === 0) return [];

      return [{
        ...projectBase(project),
        link: {
          id: project.debiteurenLink.id,
          debiteurenKlantId: project.debiteurenLink.debiteurenKlantId,
          klantNaam: project.debiteurenLink.klantNaam,
          klantEmail: project.debiteurenLink.klantEmail,
          klantAdres: project.debiteurenLink.klantAdres,
          mauticContactId: project.debiteurenLink.mauticContactId,
          normalizationCheckedAt: project.debiteurenLink.normalizationCheckedAt?.toISOString() ?? null,
          review: project.debiteurenLink.contactWarningsReviewedAt ? {
            reviewedAt: project.debiteurenLink.contactWarningsReviewedAt.toISOString(),
            reviewedBy: project.debiteurenLink.contactWarningsReviewedBy,
            note: project.debiteurenLink.contactWarningsReviewNote,
          } : null,
        },
        warnings,
      }];
    });

  const openLinksWithWarnings = linksWithWarnings
    .filter((item) => !item.link.review)
    .slice(0, 50);

  const reviewedLinksWithWarnings = linksWithWarnings
    .filter((item) => !!item.link.review)
    .slice(0, 50);

  const taxatieReadyForInvoice = activeProjects
    .filter((project) => (
      project.type === "TAXATIE"
      && !!project.debiteurenLink
      && !project.debiteurenInvoices.some((invoice) => invoice.invoiceType === "taxatie")
    ))
    .map((project) => ({
      ...projectBase(project),
      link: {
        debiteurenKlantId: project.debiteurenLink?.debiteurenKlantId ?? null,
        klantNaam: project.debiteurenLink?.klantNaam ?? null,
      },
    }))
    .slice(0, 50);

  const recentInvoices = activeProjects
    .flatMap((project) => project.debiteurenInvoices.map((invoice) => ({
      ...projectBase(project),
      invoice: {
        id: invoice.id,
        debiteurenFactuurId: invoice.debiteurenFactuurId,
        factuurnummer: invoice.factuurnummer,
        invoiceType: invoice.invoiceType,
        amountIncl: invoice.amountInclCents / 100,
        createdAt: invoice.createdAt.toISOString(),
      },
    })))
    .sort((a, b) => Date.parse(b.invoice.createdAt) - Date.parse(a.invoice.createdAt))
    .slice(0, 20);

  return {
    summary: {
      activeProjects: activeProjects.length,
      linkedProjects: linkedProjects.length,
      unlinkedWithMautic: unlinkedWithMautic.length,
      linksWithWarnings: openLinksWithWarnings.length,
      reviewedLinksWithWarnings: reviewedLinksWithWarnings.length,
      taxatieReadyForInvoice: taxatieReadyForInvoice.length,
      platformInvoices: recentInvoices.length,
    },
    linksWithWarnings: openLinksWithWarnings,
    reviewedLinksWithWarnings,
    unlinkedWithMautic,
    taxatieReadyForInvoice,
    recentInvoices,
  };
}
