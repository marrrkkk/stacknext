import { Command } from 'commander'
import { errorLine, style } from './output.js'
import { registerInitCommand } from './commands/init.js'
import { registerDevCommand } from './commands/dev.js'
import { registerStatusCommand } from './commands/status.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerExportCommand } from './commands/export.js'
import { registerMcpCommand } from './commands/mcp.js'

export const CLI_VERSION = '0.1.0'

export function createProgram(cwd = process.cwd()): Command {
  const program = new Command()
  program
    .name('nextscope')
    .description('Local-first runtime inspection for Next.js App Router applications')
    .version(CLI_VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .addHelpText(
      'after',
      '\nRun "nextscope doctor" when data does not appear in the dashboard.',
    )

  registerInitCommand(program, cwd)
  registerDevCommand(program, cwd)
  registerStatusCommand(program, cwd)
  registerDoctorCommand(program, cwd)
  registerExportCommand(program, cwd)
  registerMcpCommand(program, cwd)
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
    if (process.env.NEXTSCOPE_DEBUG === '1' && error instanceof Error && error.stack) {
      console.error(style.dim(error.stack))
    }
    process.exitCode = 1
  }
}
