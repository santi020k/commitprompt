import process from 'node:process'

const quoteCommandArgument = value => `"${value.replaceAll('"', '""')}"`

export const getBinaryInvocation = (
  binary,
  arguments_,
  {
    commandInterpreter = process.env.ComSpec ?? 'cmd.exe',
    platform = process.platform
  } = {}
) => {
  if (platform !== 'win32') {
    return {
      arguments_,
      command: binary,
      windowsVerbatimArguments: false
    }
  }

  const commandLine = [binary, ...arguments_]
    .map(quoteCommandArgument)
    .join(' ')

  return {
    arguments_: ['/d', '/s', '/c', `"${commandLine}"`],
    command: commandInterpreter,
    windowsVerbatimArguments: true
  }
}
