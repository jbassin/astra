# deploy/sops — secrets (SOPS + age)

Per roadmap **Decision E**: config lives in KDL with `ref=` pointers; the secret *values* live in a
**SOPS-encrypted** file here, decrypted at load/deploy. Nothing plaintext enters git.

## Put your age PRIVATE key here

```sh
# generate once — the output is gitignored and stays on this machine:
age-keygen -o deploy/sops/age.key

# point SOPS at it (add to your shell / deploy env):
export SOPS_AGE_KEY_FILE="$PWD/deploy/sops/age.key"

# the PUBLIC recipient (for .sops.yaml) is derived from it:
age-keygen -y deploy/sops/age.key
```

## What is / isn't committed

| File | Committed? | Why |
|------|-----------|-----|
| `age.key` (private key) | ❌ gitignored | secret — decrypts everything |
| `.sops.yaml` (recipient list) | ✅ | age **public** keys only |
| `*.enc.yaml` / `*.enc.json` (encrypted secrets) | ✅ | ciphertext, safe in git |
| anything else in this dir | ❌ (deny-by-default) | safety |

The repo `.gitignore` **denies everything** under `deploy/sops/` and re-allows only the safe files above,
so a stray private key (whatever it's named) cannot be committed by accident.
