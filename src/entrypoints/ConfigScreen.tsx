import type { RenderConfigScreenCtx } from 'datocms-plugin-sdk';
import { Canvas, SwitchField } from 'datocms-react-ui';
import type { GlobalParameters } from '../lib/types';

type Props = {
  ctx: RenderConfigScreenCtx;
};

export default function ConfigScreen({ ctx }: Props) {
  const parameters = ctx.plugin.attributes
    .parameters as Partial<GlobalParameters>;

  return (
    <Canvas ctx={ctx}>
      <SwitchField
        id="debugMode"
        name="debugMode"
        label="Debug mode"
        hint="Log visibility changes to the browser console"
        value={parameters.debugMode ?? false}
        onChange={(newValue) => {
          ctx.updatePluginParameters({
            ...parameters,
            debugMode: newValue,
          });
          ctx.notice('Settings saved successfully!');
        }}
      />
      <h3>Required fields validation</h3>
      <p>
        Please note: I attempted to implement validation for required fields,
        but this is not officially supported by DatoCMS. However, it works for
        text fields, numbers, and image assets. Please consider this a soft
        validation. It is just client-side validation.
      </p>
      <h4>Requirements for the validation to work</h4>
      <ol>
        <li>
          You must not set the field as required in the field validation
          settings!
        </li>
        <li>
          Instead, select when the field should be visible and then mark it as a
          required field in the index conditional fields configuration.
        </li>
      </ol>
    </Canvas>
  );
}
