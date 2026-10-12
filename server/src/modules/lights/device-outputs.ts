import { LightDriver } from '../../entities/enums';
import type { LightTarget } from './drivers/light-driver';

/** Configuration identities only: host aliases/physical wiring require a site test. */
export function lightOutputKeys(target: LightTarget): string[] {
  const config = target.config ?? {};
  const httpHost = (target.host ?? '').trim().toLowerCase().replace(/:80$/, '');
  const host = (target.host ?? '').trim().toLowerCase();
  const channels = [...new Set([target.channel, ...(config.channels ?? [])])];
  const keys = (type: string, values: Array<string | number>, address = httpHost) =>
    values.map((value) => JSON.stringify([type, address, value]));
  switch (target.driver) {
    case LightDriver.SHELLY_GEN1:
    case LightDriver.SHELLY_GEN2:
      return keys('shelly', channels);
    case LightDriver.TASMOTA:
      return keys('tasmota', channels);
    case LightDriver.MODBUS_TCP:
      return keys(`modbus:${config.unitId ?? 1}`, [...new Set([config.coil ?? target.channel, ...(config.channels ?? [])])], host.replace(/:502$/, ''));
    case LightDriver.ESPHOME:
      return config.entity ? keys('esphome', [config.entity]) : [];
    case LightDriver.HOME_ASSISTANT:
      return config.entityId ? keys('home_assistant', [config.entityId]) : [];
    case LightDriver.MQTT:
      return config.topic ? keys('mqtt', [config.topic], '') : [];
    default:
      return []; // Arbitrary TCP/serial/HTTP commands cannot identify an output safely.
  }
}
