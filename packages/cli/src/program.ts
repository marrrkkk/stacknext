import { Command } from 'commander'
import { errorLine, style } from './output.js'
import { registerInitCommand } from './commands/init.js'
import { registerDevCommand } from './commands/dev.js'
import { registerStatusCommand } from './commands/status.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerExportCommand } from './commands/export.js'
import { registerCoverageCommand } from './commands/coverage.js'
import { registerDiagnoseCommand } from './commands/diagnose.js'
import { registerMcpCommand } from './commands/mcp.js'
import { registerSkillCommand } from './commands/skill.js'
import { registerCaptureCommand } from './commands/capture.js'
import { registerRunsCommand } from './commands/runs.js'
import { registerBaselineCommand } from './commands/baseline.js'
import { registerCompareCommand } from './commands/compare.js'
import { registerUninstallCommand } from './commands/uninstall.js'
import { CLI_VERSION } from './version.js'

export function createProgram(cwd = process.cwd()): Command {
  const program = new Command()
  program
    .name('stacknext')
    .description('Local-first runtime inspection for Next.js App Router applications')
    .version(CLI_VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .addHelpText(
      'after',
      '\nRun "stacknext doctor" when data does not appear in the dashboard.',
    )

  registerInitCommand(program, cwd)
  registerDevCommand(program, cwd)
  registerStatusCommand(program, cwd)
  registerDoctorCommand(program, cwd)
  registerExportCommand(program, cwd)
  registerCoverageCommand(program, cwd)
  registerDiagnoseCommand(program, cwd)
  registerCaptureCommand(program, cwd)
  registerRunsCommand(program, cwd)
  registerBaselineCommand(program, cwd)
  registerCompareCommand(program, cwd)
  registerMcpCommand(program, cwd)
  registerSkillCommand(program, cwd)
  registerUninstallCommand(program, cwd)
  return program
}

export async function main(
  argv: string[] = process.argv,
  cwd = process.cwd(),
): Promise<void> {
  const program = createProgram(cwd)
  try {
    await program.parseAsync(argv)
  } catch (error) {
    errorLine(error instanceof Error ? error.message : String(error))
    if (process.env.STACKNEXT_DEBUG === '1' && error instanceof Error && error.stack) {
      console.error(style.dim(error.stack))
    }
    process.exitCode = 1
  }
}
