import { fiscalWorkerError } from "./errors";
import type { DgiiClientAdapter, XmlSignerAdapter } from "./types";

export class FailClosedXmlSigner implements XmlSignerAdapter {
  async signXml(_input: Parameters<XmlSignerAdapter["signXml"]>[0]): Promise<never> {
    throw fiscalWorkerError(
      "XML_SIGNER_NOT_CONFIGURED",
      "No dgii-ecf XML signer adapter is configured; refusing to sign or submit fiscal XML.",
      false
    );
  }
}

export class FailClosedDgiiClient implements DgiiClientAdapter {
  async submitSignedXml(_input: Parameters<DgiiClientAdapter["submitSignedXml"]>[0]): Promise<never> {
    throw fiscalWorkerError(
      "DGII_CLIENT_NOT_CONFIGURED",
      "No DGII client adapter is configured; refusing to fake DGII submission.",
      true
    );
  }

  async pollStatus(_input: Parameters<DgiiClientAdapter["pollStatus"]>[0]): Promise<never> {
    throw fiscalWorkerError(
      "DGII_CLIENT_NOT_CONFIGURED",
      "No DGII client adapter is configured; refusing to fake DGII polling.",
      true
    );
  }
}
