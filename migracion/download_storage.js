const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const objects = [
  {
    "bucket": "configuracion",
    "key": "logos/52f71b49-4dab-4373-89a1-6e4be981ee21/1775941391499-Logo_And_barr.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/c1e37852-25f6-4bae-b255-c1f0452d30a0/1778437811666-ChatGPT_Image_10_may_2026__14_30_01.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/a18f39cf-60f6-4f05-a680-05c592350b7a/1779281650762-1778437811666-ChatGPT_Image_10_may_2026__14_30_01.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/ad6d6ce1-fd57-408b-ac25-b3116d817c13/1779888019128-B.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/002dae2e-cf46-48b0-8344-e181dcf4e786/1780973938283-ChatGPT_Image_8_jun_2026__22_58_47.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/2a547d0e-4a0b-49e5-a7be-34071934c61d/1781280925354-WhatsApp_Image_2026-06-01_at_4.29.46_PM.jpeg"
  },
  {
    "bucket": "configuracion",
    "key": "2a547d0e-4a0b-49e5-a7be-34071934c61d/platos/-1000000008-1781283575405.png"
  },
  {
    "bucket": "configuracion",
    "key": "2a547d0e-4a0b-49e5-a7be-34071934c61d/platos/-1000000009-1781283679039.png"
  },
  {
    "bucket": "configuracion",
    "key": "2a547d0e-4a0b-49e5-a7be-34071934c61d/platos/-1000000007-1781283851248.png"
  },
  {
    "bucket": "configuracion",
    "key": "2a547d0e-4a0b-49e5-a7be-34071934c61d/platos/-1000000007-1781283898024.png"
  },
  {
    "bucket": "configuracion",
    "key": "2a547d0e-4a0b-49e5-a7be-34071934c61d/platos/-1000000003-1781284098854.png"
  },
  {
    "bucket": "configuracion",
    "key": "2a547d0e-4a0b-49e5-a7be-34071934c61d/platos/-1000000002-1781284139184.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/a18f39cf-60f6-4f05-a680-05c592350b7a/1781302143556-WhatsApp_Image_2026-05-19_at_3.22.43_PM.jpeg"
  },
  {
    "bucket": "configuracion",
    "key": "logos/52f71b49-4dab-4373-89a1-6e4be981ee21/1781743888939-1775941391499-Logo_And_barr.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/ff1eccd5-8d41-483a-9d51-ca65fa8af21a/1783377691129-ChatGPT_Image_6_jul_2026__18_41_18.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/ff1eccd5-8d41-483a-9d51-ca65fa8af21a/1783378132543-salpimentao.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/ff1eccd5-8d41-483a-9d51-ca65fa8af21a/1783379090642-ChatGPT_Image_6_jul_2026__19_04_32.png"
  },
  {
    "bucket": "configuracion",
    "key": "logos/a18f39cf-60f6-4f05-a680-05c592350b7a/1784606327554-WA_1780932721752.jpeg"
  },
  {
    "bucket": "configuracion",
    "key": "logos/a18f39cf-60f6-4f05-a680-05c592350b7a/1784607286465-IMG-20260716-WA0000.jpg"
  }
];

const baseDir = path.join(__dirname, 'storage_backup');
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

objects.forEach((obj, index) => {
  const localPath = path.join(baseDir, obj.key);
  const localDir = path.dirname(localPath);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  
  console.log(`[${index + 1}/${objects.length}] Downloading: ${obj.key} from bucket ${obj.bucket}`);
  try {
    const cmd = `npx @insforge/cli storage download "${obj.key}" --bucket "${obj.bucket}" --output "${localPath}"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✓ Downloaded to: ${localPath}`);
  } catch (err) {
    console.error(`✗ Failed to download ${obj.key}:`, err.message);
  }
});
