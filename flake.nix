{
  description = "Phosphor Solid - Flexible icon family for SolidJS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    git-hooks-nix.url = "github:cachix/git-hooks.nix";
    git-hooks-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs @ {flake-parts, ...}:
    flake-parts.lib.mkFlake {inherit inputs;} {
      imports = [inputs.git-hooks-nix.flakeModule];

      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];

      perSystem = {
        config,
        pkgs,
        ...
      }: {
        pre-commit.settings = {
          hooks = {
            deno-fmt = {
              enable = true;
              name = "deno fmt";
              entry = "${pkgs.deno}/bin/deno fmt";
              files = "\\.(tsx?|jsx?|json|jsonc|md)$";
              types = ["text"];
            };

            deno-lint = {
              enable = true;
              name = "deno lint";
              entry = "${pkgs.deno}/bin/deno lint";
              files = "\\.(tsx?|jsx?)$";
              types = ["text"];
            };
          };
        };

        devShells.default = pkgs.mkShell {
          shellHook = config.pre-commit.installationScript;
          packages = [pkgs.deno];
        };

        checks.pre-commit = config.pre-commit.run;
      };
    };
}
