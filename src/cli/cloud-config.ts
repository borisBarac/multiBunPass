export const BUN_CLOUD_CONFIG = `#cloud-config
package_update: true
packages:
  - curl

runcmd:
  - |
    sudo -i -u ubuntu bash << 'EOF'
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="/home/ubuntu/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    bun --version > /home/ubuntu/bun_version.txt
    EOF
`;

export function writeCloudConfigTempFile(): string {
	const tmpDir = Bun.env.TMPDIR || "/tmp";
	const path = `${tmpDir}/multibunpass-cloud-config.yaml`;
	Bun.write(path, BUN_CLOUD_CONFIG);
	return path;
}
