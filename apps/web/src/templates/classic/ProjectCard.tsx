import type { ProjectProps } from '@mohith-das/portfolio-shared';
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

        <div className="project-body">
          <div>
            <h4>Design decision</h4>
            <p>{project.body.designDecision}</p>
          </div>
          <div>
            <h4>{'What\u2019s real'}</h4>
            <p>{project.body.whatsReal}</p>
          </div>
          <div>
            <h4>Honest constraint</h4>
            <p>{project.body.honestConstraint}</p>
          </div>
        </div>

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
