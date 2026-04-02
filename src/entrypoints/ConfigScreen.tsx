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
        This plugin offers a soft client-side validation for conditionally
        required fields. It works for text fields, numbers, and image assets.
        Because DatoCMS does not officially support this, please note the
        following:
      </p>
      <h4>Requirements for the validation to work</h4>
      <ol>
        <li>
          Do <strong>not</strong> set the field as required in the DatoCMS field
          validation settings. Instead, mark it as &ldquo;Required when
          visible&rdquo; in the plugin&rsquo;s per-field rule configuration.
        </li>
        <li>
          Fields that are <strong>always visible</strong> and already marked as
          required in DatoCMS do <strong>not</strong> need to be added here.
          Only add fields whose required status depends on the dropdown
          selection.
        </li>
      </ol>
    </Canvas>
  );
}
