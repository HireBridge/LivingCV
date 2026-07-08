import type { ProjectProps } from '@livingcv/shared';
import { RevealOnScroll } from './RevealOnScroll';

export function ProjectCard({ project }: { project: ProjectProps }) {
  return (
    <div className="project">
      <RevealOnScroll>
        <div className="project-head">
          <h3 className="project-name">{project.name}</h3>
          {project.links.length > 0 ? (
            <div className="project-links">
              {project.links.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <p className="project-tagline">{project.tagline}</p>

        {project.hasCaseStudy ? (
          <a className="project-case-link" href={`/projects/${project.slug}`}>
            Read the case study →
          </a>
        ) : null}

        {project.diagramSvg ? (
          <div className="diagram-box">
            <div dangerouslySetInnerHTML={{ __html: project.diagramSvg }} />
            {project.diagramCaption ? (
              <p className="diagram-caption">{project.diagramCaption}</p>
            ) : null}
          </div>
        ) : null}

        {project.body.columns.length > 0 ? (
          <div
            className="project-body"
            data-cols={Math.min(project.body.columns.length, 3)}
          >
            {project.body.columns.map((col, i) => (
              <div key={i}>
                <h4>{col.heading}</h4>
                <p>{col.body}</p>
              </div>
            ))}
          </div>
        ) : null}

        {project.installCmd ? (
          <div className="install-row">
            <span className="prompt">$</span>
            <code>{project.installCmd}</code>
          </div>
        ) : null}
      </RevealOnScroll>
    </div>
  );
}
