const required = [
  "CF_API_TOKEN",
  "CF_ACCOUNT_ID",
  "CF_ZONE_ID",
  "CF_PAGES_PROJECT",
  "CF_DOMAIN",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const apiToken = process.env.CF_API_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
const zoneId = process.env.CF_ZONE_ID;
const project = process.env.CF_PAGES_PROJECT;
const domain = process.env.CF_DOMAIN;
const target = process.env.CF_CNAME_TARGET || `${project}.pages.dev`;

async function cfFetch(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(`Cloudflare API error for ${path}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function ensureDnsRecord() {
  const existing = await cfFetch(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`);
  const match = existing.result.find((record) => record.type === "CNAME");

  const payload = {
    type: "CNAME",
    name: domain,
    content: target,
    proxied: true,
    ttl: 1,
  };

  if (match) {
    await cfFetch(`/zones/${zoneId}/dns_records/${match.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    console.log(`Updated existing CNAME ${domain} -> ${target}`);
    return;
  }

  await cfFetch(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log(`Created CNAME ${domain} -> ${target}`);
}

async function ensurePagesDomain() {
  const domains = await cfFetch(`/accounts/${accountId}/pages/projects/${project}/domains`);
  const exists = domains.result.some((entry) => entry.name === domain);

  if (!exists) {
    await cfFetch(`/accounts/${accountId}/pages/projects/${project}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
    console.log(`Attached ${domain} to Pages project ${project}`);
  } else {
    console.log(`Pages project ${project} already has ${domain} attached`);
  }
}

async function pollStatus() {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const domains = await cfFetch(`/accounts/${accountId}/pages/projects/${project}/domains/${domain}`);
    const status = domains.result.status;
    const verification = domains.result.verification_data?.status;
    console.log(`Attempt ${attempt}: status=${status}, verification=${verification}`);

    if (status === "active") {
      console.log(`Custom domain is active: https://${domain}`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Timed out waiting for ${domain} to become active.`);
}

async function main() {
  await ensurePagesDomain();
  await ensureDnsRecord();
  await pollStatus();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
