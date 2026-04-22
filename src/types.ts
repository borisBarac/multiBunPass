export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type VMInfo = {
  name: string;
  state: string;
  ipv4: string[];
  image: string;
  release: string;
};

export type CreateVMOptions = {
  name: string;
  folderPath: string;
  remotePath?: string;
};
