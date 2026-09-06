/**
 * Sections and their items.
 *
 * Reorder is native HTML drag-and-drop with a keyboard path alongside it. A
 * drag library would be a dependency and a bundle for one interaction, and the
 * keyboard buttons are the accessible route regardless — a mouse-only reorder
 * would not be usable at all without them.
 */
import React from "react";

import { Icon, IconButton, Input, Textarea } from "../ds.js";
import { blankItem, blankSection, itemAmount } from "@jura/shared/document.js";
import { centsToInput, formatCents, formatMoney, parseMoneyToCents } from "@jura/shared/money.js";

export function SectionEditor({ doc, update, readOnly }) {
  const [dragging, setDragging] = React.useState(null);
  const [dropTarget, setDropTarget] = React.useState(null);

  const setSections = (next) => update((current) => ({ ...current, sections: next }));

  const patchSection = (sectionId, change) =>
    setSections(doc.sections.map((section) => (section.id === sectionId ? { ...section, ...change } : section)));

  const moveSection = (from, to) => {
    if (to < 0 || to >= doc.sections.length || from === to) return;
    const next = [...doc.sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSections(next);
  };

  const addSection = () => setSections([...doc.sections, blankSection()]);
  const removeSection = (sectionId) => setSections(doc.sections.filter((s) => s.id !== sectionId));

  const patchItem = (sectionId, itemId, change) =>
    patchSection(sectionId, {
      items: doc.sections
        .find((s) => s.id === sectionId)
        .items.map((item) => (item.id === itemId ? { ...item, ...change } : item)),
    });

  const addItem = (sectionId) => {
    const section = doc.sections.find((s) => s.id === sectionId);
    patchSection(sectionId, { items: [...section.items, blankItem()] });
  };

  const removeItem = (sectionId, itemId) => {
    const section = doc.sections.find((s) => s.id === sectionId);
    patchSection(sectionId, { items: section.items.filter((item) => item.id !== itemId) });
  };

  return (
    <div>
      {doc.sections.map((section, index) => {
        const subtotal = section.items.reduce((sum, item) => sum + itemAmount(item), 0);
        return (
          <div
            key={section.id}
            className="section-card"
            data-dragging={dragging === index ? "true" : undefined}
            data-drop={dropTarget === index && dragging !== index ? "true" : undefined}
            onDragOver={(event) => {
              if (dragging === null || readOnly) return;
              event.preventDefault();
              setDropTarget(index);
            }}
            onDrop={(event) => {
              if (dragging === null || readOnly) return;
              event.preventDefault();
              moveSection(dragging, index);
              setDragging(null);
              setDropTarget(null);
            }}
          >
            <div className="section-card__head">
              {readOnly ? null : (
                <span
                  className="grip"
                  draggable
                  role="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onDragStart={() => setDragging(index)}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  title="Drag to reorder"
                >
                  <Icon name="GripVertical" size={16} />
                </span>
              )}
              <strong className="mono" style={{ color: "var(--text-brand)", fontSize: "var(--text-caption)" }}>
                {index + 1}
              </strong>
              <Input
                aria-label={`Section ${index + 1} title`}
                placeholder="Section title"
                value={section.title}
                readOnly={readOnly}
                onChange={(event) => patchSection(section.id, { title: event.target.value })}
              />
              <Input
                aria-label={`Section ${index + 1} note`}
                placeholder="When, or how long"
                value={section.meta ?? ""}
                readOnly={readOnly}
                onChange={(event) => patchSection(section.id, { meta: event.target.value })}
                style={{ maxWidth: 180 }}
              />
              <span className="section-card__total">{formatMoney(subtotal, doc.currency)}</span>
              {readOnly ? null : (
                <>
                  <IconButton
                    label="Move section up"
                    size="sm"
                    variant="ghost"
                    icon={<Icon name="ChevronUp" size={16} />}
                    onClick={() => moveSection(index, index - 1)}
                    disabled={index === 0}
                  />
                  <IconButton
                    label="Move section down"
                    size="sm"
                    variant="ghost"
                    icon={<Icon name="ChevronDown" size={16} />}
                    onClick={() => moveSection(index, index + 1)}
                    disabled={index === doc.sections.length - 1}
                  />
                  <IconButton
                    label="Remove section"
                    size="sm"
                    variant="ghost"
                    icon={<Icon name="Trash2" size={16} />}
                    onClick={() => removeSection(section.id)}
                    disabled={doc.sections.length === 1}
                  />
                </>
              )}
            </div>

            {section.items.map((item) => (
              <ItemFields
                key={item.id}
                item={item}
                currency={doc.currency}
                readOnly={readOnly}
                onChange={(change) => patchItem(section.id, item.id, change)}
                onRemove={() => removeItem(section.id, item.id)}
                canRemove={section.items.length > 1}
              />
            ))}

            {readOnly ? null : (
              <button type="button" className="add-row" onClick={() => addItem(section.id)}>
                <Icon name="Plus" size={16} /> add item
              </button>
            )}
          </div>
        );
      })}

      {readOnly ? null : (
        <button type="button" className="add-section" onClick={addSection}>
          + add section
        </button>
      )}
    </div>
  );
}

function ItemFields({ item, currency, readOnly, onChange, onRemove, canRemove }) {
  // The price field keeps what was typed while it is being typed, so a
  // half-entered "1,2" is not reformatted out from under the cursor.
  const [priceText, setPriceText] = React.useState(() => centsToInput(item.unit_price_cents));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setPriceText(centsToInput(item.unit_price_cents));
  }, [item.unit_price_cents, focused]);

  return (
    <div className="item-row">
      <Input
        aria-label="Description"
        placeholder="What this is for"
        value={item.description}
        readOnly={readOnly}
        onChange={(event) => onChange({ description: event.target.value })}
      />
      <Input
        aria-label="Quantity"
        inputMode="decimal"
        value={String(item.qty ?? "")}
        readOnly={readOnly}
        onChange={(event) => {
          const value = event.target.value.trim();
          const qty = value === "" ? 0 : Number(value);
          if (Number.isFinite(qty)) onChange({ qty });
        }}
      />
      <Input
        aria-label="Unit price"
        inputMode="decimal"
        placeholder="0.00"
        value={priceText}
        readOnly={readOnly}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPriceText(centsToInput(item.unit_price_cents));
        }}
        onChange={(event) => {
          setPriceText(event.target.value);
          onChange({ unit_price_cents: parseMoneyToCents(event.target.value) });
        }}
      />
      <span className="item-row__amount">{formatCents(itemAmount(item))}</span>
      {readOnly ? (
        <span />
      ) : (
        <IconButton
          label="Remove item"
          size="sm"
          variant="ghost"
          icon={<Icon name="X" size={16} />}
          onClick={onRemove}
          disabled={!canRemove}
        />
      )}
      {readOnly && !item.note ? null : (
        <div className="item-row__note">
          <Textarea
            aria-label="Item note"
            placeholder="Optional note, printed under the description"
            rows={item.note ? 2 : 1}
            value={item.note ?? ""}
            readOnly={readOnly}
            onChange={(event) => onChange({ note: event.target.value })}
            style={{ fontSize: "var(--text-caption)" }}
          />
        </div>
      )}
    </div>
  );
}
