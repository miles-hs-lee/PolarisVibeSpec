#!/usr/bin/env node
import { Command } from 'commander';
import { runGenerate } from './commands/generate';
import { runQuery } from './commands/query';
import { runShow } from './commands/show';
import { runLink } from './commands/link';
import { runImpact } from './commands/impact';
import { runExport } from './commands/export';
import { runList } from './commands/list';
import { runAddFile } from './commands/addFile';
import { runRmFile } from './commands/rmFile';
import { runValidate } from './commands/validate';
import { runExportAll } from './commands/exportAll';
import { runAsk } from './commands/ask';
import { runBootstrap } from './commands/bootstrap';
import { runEnrich } from './commands/enrich';
import { fail } from './output';

const program = new Command();

program
  .name('pv')
  .description('Polaris Vibe Spec — graph-backed spec layer for AI coding agents.')
  .version('0.1.0')
  .option('--pretty', 'pretty-print JSON output');

program
  .command('generate <intent>')
  .description('compile a natural-language intent into spec node(s)')
  .option('--llm', 'use LLM compiler (stubbed; falls back to heuristic)')
  .option('--prompt', 'emit a prompt for your coding agent to do the work (no graph mutation)')
  .action((intent: string, cmdOpts: { llm?: boolean; prompt?: boolean }) => {
    runGenerate(intent, {
      pretty: program.opts().pretty,
      llm: cmdOpts.llm,
      prompt: cmdOpts.prompt
    });
  });

program
  .command('ask <intent>')
  .description('one-shot preamble: classify intent + search graph + impact for top hit')
  .option('-n, --limit <n>', 'max query hits to return (default 5)', (v) => parseInt(v, 10))
  .option('-d, --depth <n>', 'override impact traversal depth', (v) => parseInt(v, 10))
  .option('--minimal', 'tight output: just {recommendation, reason, root, coverage, files}')
  .action((intent: string, cmdOpts: { limit?: number; depth?: number; minimal?: boolean }) => {
    runAsk(intent, {
      pretty: program.opts().pretty,
      limit: cmdOpts.limit,
      depth: cmdOpts.depth,
      minimal: cmdOpts.minimal
    });
  });

program
  .command('query <text>')
  .description('search nodes by tag/title/description')
  .option('-n, --limit <n>', 'max results', (v) => parseInt(v, 10))
  .action((text: string, cmdOpts: { limit?: number }) => {
    runQuery(text, { pretty: program.opts().pretty, limit: cmdOpts.limit });
  });

program
  .command('show <id>')
  .description('show a single node and its incoming relations')
  .action((id: string) => {
    runShow(id, { pretty: program.opts().pretty });
  });

program
  .command('link <fromId> <toId> <relation>')
  .description('add an edge: fromId -[relation]-> toId (depends_on|implements|affects|uses)')
  .action((fromId: string, toId: string, relation: string) => {
    runLink(fromId, toId, relation, { pretty: program.opts().pretty });
  });

program
  .command('impact <id>')
  .description('return impacted nodes + files for a change to <id>')
  .option('-d, --depth <n>', 'max traversal depth', (v) => parseInt(v, 10))
  .option('--files-only', 'emit just impacted file paths newline-delimited (no JSON)')
  .action((id: string, cmdOpts: { depth?: number; filesOnly?: boolean }) => {
    runImpact(id, {
      pretty: program.opts().pretty,
      depth: cmdOpts.depth,
      filesOnly: cmdOpts.filesOnly
    });
  });

program
  .command('export <id>')
  .description('render a node as Markdown (to stdout, or to .polaris/specs/ with --write)')
  .option('-w, --write', 'write to .polaris/specs/<id>.md instead of stdout')
  .action((id: string, cmdOpts: { write?: boolean }) => {
    runExport(id, { pretty: program.opts().pretty, write: cmdOpts.write });
  });

program
  .command('list')
  .description('list nodes (filter by --type and/or --domain)')
  .option('-t, --type <type>', 'requirement|api|workflow|entity')
  .option('-d, --domain <domain>', 'e.g. AUTH, BILLING')
  .action((cmdOpts: { type?: string; domain?: string }) => {
    runList({ pretty: program.opts().pretty, type: cmdOpts.type, domain: cmdOpts.domain });
  });

program
  .command('add-file <id> <path>')
  .description('attach a file path to a node in the codemap')
  .action((id: string, p: string) => {
    runAddFile(id, p, { pretty: program.opts().pretty });
  });

program
  .command('rm-file <id> <path>')
  .description('detach a file path from a node in the codemap')
  .action((id: string, p: string) => {
    runRmFile(id, p, { pretty: program.opts().pretty });
  });

program
  .command('validate')
  .description('verify graph integrity (dangling relations, dup ids, missing files)')
  .action(() => {
    runValidate({ pretty: program.opts().pretty });
  });

program
  .command('export-all')
  .description('regenerate human-readable spec/ from the graph (per-node + README index)')
  .option('-o, --out <dir>', 'output directory (default: ./spec)')
  .action((cmdOpts: { out?: string }) => {
    runExportAll({ pretty: program.opts().pretty, outDir: cmdOpts.out });
  });

program
  .command('bootstrap')
  .description('propose a draft graph + codemap by scanning source files (writes to .polaris/*.bootstrap.json)')
  .option('--root <dir>', 'directory to scan (default: src)')
  .option('--prompt', 'after writing the heuristic draft, emit a prompt for your agent to refine it semantically')
  .action((cmdOpts: { root?: string; prompt?: boolean }) => {
    runBootstrap({
      pretty: program.opts().pretty,
      scanRoot: cmdOpts.root,
      prompt: cmdOpts.prompt
    });
  });

program
  .command('enrich <id>')
  .description('emit a prompt for your coding agent to flesh out a node\'s description and relations')
  .option('--prompt', 'required — see usage')
  .action((id: string, cmdOpts: { prompt?: boolean }) => {
    runEnrich(id, { prompt: cmdOpts.prompt });
  });

program
  .exitOverride((err) => {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    fail(err.message || 'CLI parse error', { code: err.code });
  });

program.parseAsync(process.argv).catch((err: Error) => {
  fail(err.message || 'unhandled error');
});
