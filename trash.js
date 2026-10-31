import { access, mkdir, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Put one directory into the platform's trash instead of deleting it.
 *
 * `DSH_SCRATCH_TRASH_DIR` overrides the destination; it exists so automated
 * tests never touch a real Trash and so an operator can redirect trashing to a
 * dedicated folder. When it is set the directory is renamed into it.
 *
 * Throws when the platform has no usable trash. Callers must treat that as a
 * refusal: silently falling back to permanent deletion would break the promise
 * the UI makes.
 */
export async function moveToTrash(target) {
  const override = process.env.DSH_SCRATCH_TRASH_DIR;
  if (override) return moveInto(override, target);

  if (process.platform === 'darwin') {
    return moveInto(path.join(os.homedir(), '.Trash'), target);
  }
  if (process.platform === 'win32') {
    return recycleOnWindows(target);
  }
  return trashWithGio(target);
}

async function moveInto(directory, target) {
  await mkdir(directory, { recursive: true });
  const finalPath = await uniquePath(directory, path.basename(target));
  try {
    await rename(target, finalPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      throw new Error(
        `临时目录与废纸篓不在同一磁盘，无法移入废纸篓：${target}。请先把存放位置改到同一磁盘，或手动处理该目录。`,
      );
    }
    throw error;
  }
  return { trashed: true, location: finalPath };
}

async function uniquePath(directory, name) {
  const exists = async value => access(value, constants.F_OK).then(() => true, () => false);
  let candidate = path.join(directory, name);
  let index = 2;
  while (await exists(candidate)) {
    candidate = path.join(directory, `${name} ${index}`);
    index += 1;
  }
  return candidate;
}

async function recycleOnWindows(target) {
  const script = [
    'Add-Type -AssemblyName Microsoft.VisualBasic;',
    `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${target.replace(/'/g, "''")}',`,
    "'OnlyErrorDialogs', 'SendToRecycleBin')",
  ].join(' ');
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  return { trashed: true, location: null };
}

async function trashWithGio(target) {
  try {
    await run('gio', ['trash', '--', target]);
    return { trashed: true, location: null };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('此系统没有可用的回收站工具（gio）。请安装 glib2 的 gio，或手动处理该目录。');
    }
    throw error;
  }
}
