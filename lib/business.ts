/**
 * Catálogos do vendedor e o mapa para a taxonomia da Whop.
 *
 * A Whop classifica a conta em três níveis (business_type > industry_group >
 * industry_type). Os rótulos da thesain26 são os que o vendedor escolhe; o
 * trio enviado em accounts.update sai daqui, sempre com uma combinação que
 * existe no glossário publicado. Se a Whop recusar o código, o dado local
 * permanece e a tela mostra o erro.
 */

export const BUSINESS_TYPES = [
  { value: "education", label: "Education" },
  { value: "mentorship", label: "Mentorship" },
  { value: "coaching", label: "Coaching" },
  { value: "software", label: "Software" },
  { value: "community", label: "Community" },
  { value: "digital_product", label: "Digital Product" },
  { value: "consulting", label: "Consulting" },
  { value: "other", label: "Other" },
] as const;

export const INDUSTRY_TYPES = [
  { value: "knowledge_business", label: "Knowledge & Business Training" },
  { value: "online_education", label: "Online Education" },
  { value: "coaching_mentoring", label: "Coaching & Mentoring" },
  { value: "software_saas", label: "Software & SaaS" },
  { value: "creator_economy", label: "Creator Economy" },
  { value: "other", label: "Other" },
] as const;

export const COUNTRIES = [
  { code: "BR", label: "Brasil" },
  { code: "US", label: "Estados Unidos" },
  { code: "PT", label: "Portugal" },
  { code: "ES", label: "Espanha" },
  { code: "MX", label: "México" },
  { code: "AR", label: "Argentina" },
  { code: "CO", label: "Colômbia" },
  { code: "CL", label: "Chile" },
  { code: "GB", label: "Reino Unido" },
  { code: "IE", label: "Irlanda" },
  { code: "DE", label: "Alemanha" },
  { code: "FR", label: "França" },
  { code: "IT", label: "Itália" },
  { code: "NL", label: "Países Baixos" },
  { code: "CA", label: "Canadá" },
  { code: "AU", label: "Austrália" },
] as const;

export const PRODUCT_TYPES = [
  { value: "mentoria_1_1", label: "Mentoria 1:1" },
  { value: "curso", label: "Curso" },
  { value: "comunidade", label: "Comunidade" },
  { value: "software", label: "Software" },
  { value: "ebook", label: "Ebook" },
  { value: "consultoria", label: "Consultoria" },
  { value: "assinatura", label: "Assinatura" },
  { value: "outro", label: "Outro" },
] as const;

export const DELIVERY_METHODS = [
  { value: "manual", label: "Manual" },
  { value: "email", label: "Email automático" },
  { value: "community", label: "Acesso a comunidade" },
  { value: "download", label: "Link de download" },
] as const;

export const CURRENCIES = [
  { value: "usd", label: "USD" },
  { value: "brl", label: "BRL" },
  { value: "eur", label: "EUR" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];
export type IndustryType = (typeof INDUSTRY_TYPES)[number]["value"];
export type ProductType = (typeof PRODUCT_TYPES)[number]["value"];
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]["value"];
export type CurrencyCode = (typeof CURRENCIES)[number]["value"];

type WhopClass = {
  business_type: string;
  industry_group: string;
  industry_type: string;
  otherBusiness?: string;
  otherIndustry?: string;
};

const EDUCATION = "education";

function educationIndustry(industry: IndustryType): WhopClass {
  switch (industry) {
    case "online_education":
      return {
        business_type: EDUCATION,
        industry_group: "academic_and_test_prep",
        industry_type: "stem_education",
      };
    case "coaching_mentoring":
      return {
        business_type: EDUCATION,
        industry_group: "personal_development",
        industry_type: "life_coaching",
      };
    case "software_saas":
      return {
        business_type: EDUCATION,
        industry_group: "tech_and_ai",
        industry_type: "software_development_general",
      };
    case "creator_economy":
      return {
        business_type: EDUCATION,
        industry_group: "creative_and_content_creation",
        industry_type: "content_creation_general",
      };
    case "other":
      return {
        business_type: EDUCATION,
        industry_group: "news_and_general_interest",
        industry_type: "education_sector",
      };
    default:
      return {
        business_type: EDUCATION,
        industry_group: "business_and_entrepreneurship",
        industry_type: "business_strategy",
      };
  }
}

/**
 * Converte as escolhas do formulário no trio que accounts.update aceita.
 * Mentoria, coaching, comunidade e produto digital entram em `education`
 * porque é ali que o glossário lista curso, coaching e conteúdo.
 */
export function toWhopClassification(
  businessType: string,
  industryType: string,
): WhopClass {
  const business = (BUSINESS_TYPES.some((item) => item.value === businessType)
    ? businessType
    : "other") as BusinessType;
  const industry = (INDUSTRY_TYPES.some((item) => item.value === industryType)
    ? industryType
    : "other") as IndustryType;
  const businessLabel =
    BUSINESS_TYPES.find((item) => item.value === business)?.label ?? business;
  const industryLabel =
    INDUSTRY_TYPES.find((item) => item.value === industry)?.label ?? industry;

  if (business === "other") {
    return {
      business_type: "other",
      industry_group: "miscellaneous",
      industry_type: "other_general",
      otherBusiness: businessLabel,
      otherIndustry: industryLabel,
    };
  }

  if (business === "software" || business === "community") {
    switch (industry) {
      case "online_education":
        return {
          business_type: "software",
          industry_group: "community_education_and_events_software",
          industry_type: "virtual_classroom",
        };
      case "coaching_mentoring":
        return {
          business_type: "software",
          industry_group: "community_education_and_events_software",
          industry_type: "community",
        };
      case "creator_economy":
        return {
          business_type: "software",
          industry_group: "creative_and_media_software",
          industry_type: "streaming",
        };
      case "software_saas":
        return {
          business_type: "software",
          industry_group: "productivity_and_collaboration",
          industry_type: "project_management",
        };
      case "other":
        return {
          business_type: "software",
          industry_group: "community_education_and_events_software",
          industry_type: "forums",
        };
      default:
        return {
          business_type: "software",
          industry_group: "productivity_and_collaboration",
          industry_type: "knowledge_base",
        };
    }
  }

  if (business === "consulting") {
    switch (industry) {
      case "online_education":
        return {
          business_type: "services",
          industry_group: "consulting",
          industry_type: "education_consulting",
        };
      case "software_saas":
        return {
          business_type: "services",
          industry_group: "software_development_and_it",
          industry_type: "software_development",
        };
      case "creator_economy":
        return {
          business_type: "services",
          industry_group: "creative_and_media_production",
          industry_type: "content_writing",
        };
      case "other":
        return {
          business_type: "services",
          industry_group: "consulting",
          industry_type: "done_for_you",
        };
      default:
        return {
          business_type: "services",
          industry_group: "consulting",
          industry_type: "management_consulting",
        };
    }
  }

  if (business === "digital_product") {
    if (industry === "coaching_mentoring") {
      return educationIndustry("coaching_mentoring");
    }
    if (industry === "creator_economy" || industry === "software_saas") {
      return educationIndustry(industry);
    }
    return {
      business_type: EDUCATION,
      industry_group: "digital_products_and_publishing",
      industry_type:
        industry === "online_education" ? "course_creation" : "digital_product_creation",
    };
  }

  if (business === "mentorship") {
    if (industry === "knowledge_business" || industry === "online_education") {
      return {
        business_type: EDUCATION,
        industry_group: "career_and_professional_skills",
        industry_type:
          industry === "online_education" ? "executive_coaching" : "career_development",
      };
    }
    return educationIndustry(industry);
  }

  return educationIndustry(industry);
}

export function labelOf(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return options.find((item) => item.value === value)?.label ?? value;
}

export type SocialPlatform =
  | "instagram"
  | "youtube"
  | "linkedin"
  | "x"
  | "tiktok"
  | "facebook"
  | "website";

export function normalizeHttpUrl(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const normalized = url.toString();
    if (normalized.length > 255) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function socialPlatform(url: string): SocialPlatform {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host === "x.com" || host.includes("twitter.com")) return "x";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("facebook.com")) return "facebook";
  } catch {
    return "website";
  }
  return "website";
}

/** Separa a URL principal do cadastro nos campos da loja. */
export function splitPrimarySocial(url: string | null) {
  const platform = url ? socialPlatform(url) : null;
  return {
    socialUrl: url,
    website: platform === "website" ? url : null,
    instagram: platform === "instagram" ? url : null,
    youtube: platform === "youtube" ? url : null,
    linkedin: platform === "linkedin" ? url : null,
  };
}

export function buildSocialLinks(input: {
  website?: string | null;
  socialUrl?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
}) {
  const entries: { url: string; website: SocialPlatform; title: string }[] = [];
  const push = (url: string | null | undefined, platform?: SocialPlatform, title?: string) => {
    if (!url) return;
    if (entries.some((item) => item.url === url)) return;
    const website = platform ?? socialPlatform(url);
    entries.push({
      url,
      website,
      title: title ?? website,
    });
  };

  push(input.website, "website", "Site");
  push(input.socialUrl);
  push(input.instagram, "instagram", "Instagram");
  push(input.youtube, "youtube", "YouTube");
  push(input.linkedin, "linkedin", "LinkedIn");
  return entries;
}
